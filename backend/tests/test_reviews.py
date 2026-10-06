"""Review API against the real test Postgres, with tokens signed by a throwaway key standing in for Supabase."""
import time
import uuid

import jwt
import psycopg
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app import auth, main

KEY = ec.generate_private_key(ec.SECP256R1())
ALICE, BOB = str(uuid.uuid4()), str(uuid.uuid4())
TODAY_MENU = {"repas": [{"type": "midi", "categories": []}]}


def token(sub, **overrides):
    claims = {"sub": sub, "aud": "authenticated", "iss": auth.ISSUER, "exp": int(time.time()) + 3600} | overrides
    return {"Authorization": "Bearer " + jwt.encode(claims, KEY, algorithm="ES256")}


@pytest.fixture(scope="module")
def client():
    try:
        psycopg.connect("postgresql://crous:crous@localhost:5434/crous_test", connect_timeout=2).close()
    except psycopg.OperationalError:
        pytest.skip("test Postgres not running (docker compose up -d db)")
    with TestClient(main.app) as c:  # runs lifespan -> creates tables
        yield c


@pytest.fixture(autouse=True)
def setup(client, monkeypatch):
    monkeypatch.setattr(auth, "_signing_key", lambda _token: KEY.public_key())

    async def upstream(path, ttl):
        return TODAY_MENU if path == main.menu_path(21, main.today()) else None

    monkeypatch.setattr(main, "upstream", upstream)
    with psycopg.connect("postgresql://crous:crous@localhost:5434/crous_test", autocommit=True) as conn:
        conn.execute("TRUNCATE review")


def test_one_review_per_user_per_meal_and_average(client):
    assert client.put("/restaurants/21/reviews/mine", json={"rating": 2}, headers=token(ALICE)).status_code == 204
    # Writing again replaces instead of adding a second review
    client.put("/restaurants/21/reviews/mine", json={"rating": 4, "comment": " Bon "}, headers=token(ALICE))
    client.put("/restaurants/21/reviews/mine", json={"rating": 5}, headers=token(BOB))

    body = client.get("/restaurants/21/reviews", headers=token(ALICE)).json()
    assert (body["count"], body["average"]) == (2, 4.5)
    mine = [r for r in body["reviews"] if r["mine"]]
    assert len(mine) == 1 and (mine[0]["rating"], mine[0]["comment"]) == (4, "Bon")
    # Anonymous viewers see the reviews but none is "mine", and no user ids leak
    anon = client.get("/restaurants/21/reviews").json()["reviews"]
    assert not any(r["mine"] for r in anon) and all("user_id" not in r for r in anon)


def test_delete_own_review(client):
    client.put("/restaurants/21/reviews/mine", json={"rating": 3}, headers=token(ALICE))
    assert client.delete("/restaurants/21/reviews/mine", headers=token(BOB)).status_code == 404
    assert client.delete("/restaurants/21/reviews/mine", headers=token(ALICE)).status_code == 204
    assert client.get("/restaurants/21/reviews").json()["count"] == 0


def test_rejects_bad_auth(client):
    put = lambda headers: client.put("/restaurants/21/reviews/mine", json={"rating": 3}, headers=headers).status_code
    assert put({}) == 401
    assert put({"Authorization": "Bearer not-a-jwt"}) == 401
    assert put(token(ALICE, exp=int(time.time()) - 10)) == 401  # expired
    assert put(token(ALICE, iss="https://evil.supabase.co/auth/v1")) == 401  # other project
    assert put(token(ALICE, aud="anon")) == 401
    other_key = ec.generate_private_key(ec.SECP256R1())  # right claims, wrong signature
    forged = jwt.encode({"sub": ALICE, "aud": "authenticated", "iss": auth.ISSUER, "exp": int(time.time()) + 60}, other_key, algorithm="ES256")
    assert put({"Authorization": f"Bearer {forged}"}) == 401


def test_rejects_invalid_reviews(client):
    put = lambda body, code=21, meal="midi": client.put(
        f"/restaurants/{code}/reviews/mine", params={"meal": meal}, json=body, headers=token(ALICE)
    ).status_code
    assert put({"rating": 0}) == 422
    assert put({"rating": 6}) == 422
    assert put({"rating": 3, "comment": "x" * 501}) == 422
    assert put({"rating": 3}, code=999) == 404  # no menu today
    assert put({"rating": 3}, meal="soir") == 404  # meal not served today
