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
ALICE, BOB, CAROL, DAN = (str(uuid.uuid4()) for _ in range(4))
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

    async def flagged(text):
        return "BAD" in text

    monkeypatch.setattr(main, "is_flagged", flagged)
    with psycopg.connect("postgresql://crous:crous@localhost:5434/crous_test", autocommit=True) as conn:
        conn.execute("TRUNCATE review, report, block")


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


def review_id(client, author):
    return next(r["id"] for r in client.get("/restaurants/21/reviews", headers=token(author)).json()["reviews"] if r["mine"])


def visible_to(client, viewer=None):
    headers = token(viewer) if viewer else {}
    return [r["comment"] for r in client.get("/restaurants/21/reviews", headers=headers).json()["reviews"]]


def test_flagged_comment_is_rejected(client):
    res = client.put("/restaurants/21/reviews/mine", json={"rating": 1, "comment": "BAD words"}, headers=token(ALICE))
    assert (res.status_code, res.json()["detail"]) == (422, "comment_rejected")
    assert visible_to(client) == []


def test_report_hides_for_reporter_then_for_everyone_after_three(client):
    client.put("/restaurants/21/reviews/mine", json={"rating": 1, "comment": "spam"}, headers=token(ALICE))
    rid = review_id(client, ALICE)
    report = lambda who, reason="spam": client.post(f"/reviews/{rid}/report", json={"reason": reason}, headers=token(who))

    assert report(BOB).status_code == 204
    assert report(BOB).status_code == 204  # repeat report is a no-op, not a second vote
    assert visible_to(client, BOB) == []
    assert visible_to(client) == ["spam"]  # one reporter doesn't hide it for others

    report(CAROL, "offensive")
    assert visible_to(client) == ["spam"]
    report(DAN)
    assert visible_to(client) == []  # 3 distinct reporters
    assert visible_to(client, ALICE) == ["spam"]  # author still sees their own review

    # editing doesn't shake off the reports
    client.put("/restaurants/21/reviews/mine", json={"rating": 2, "comment": "edited"}, headers=token(ALICE))
    assert visible_to(client) == []


def test_block_hides_all_of_an_authors_reviews_for_the_blocker_only(client):
    client.put("/restaurants/21/reviews/mine", json={"rating": 1, "comment": "rude"}, headers=token(ALICE))
    client.put("/restaurants/21/reviews/mine", json={"rating": 5, "comment": "nice"}, headers=token(CAROL))
    assert client.post(f"/reviews/{review_id(client, ALICE)}/block-author", headers=token(BOB)).status_code == 204
    assert visible_to(client, BOB) == ["nice"]
    assert sorted(visible_to(client, CAROL)) == ["nice", "rude"]


def test_report_and_block_guards(client):
    client.put("/restaurants/21/reviews/mine", json={"rating": 3}, headers=token(ALICE))
    rid = review_id(client, ALICE)
    assert client.post(f"/reviews/{rid}/report", json={"reason": "spam"}).status_code == 401
    assert client.post(f"/reviews/{rid}/report", json={"reason": "spam"}, headers=token(ALICE)).status_code == 400
    assert client.post(f"/reviews/{rid}/block-author", headers=token(ALICE)).status_code == 400
    assert client.post("/reviews/999999/report", json={"reason": "spam"}, headers=token(BOB)).status_code == 404
    assert client.post(f"/reviews/{rid}/report", json={"reason": "meh"}, headers=token(BOB)).status_code == 422


def test_delete_account_purges_only_that_users_data_and_the_auth_account(client, monkeypatch):
    deleted = []

    async def fake_delete(user_id):
        deleted.append(user_id)

    monkeypatch.setattr(auth, "delete_auth_user", fake_delete)
    client.put("/restaurants/21/reviews/mine", json={"rating": 1, "comment": "alice"}, headers=token(ALICE))
    client.put("/restaurants/21/reviews/mine", json={"rating": 5, "comment": "bob"}, headers=token(BOB))
    client.put("/restaurants/21/reviews/mine", json={"rating": 4, "comment": "carol"}, headers=token(CAROL))
    client.post(f"/reviews/{review_id(client, BOB)}/report", json={"reason": "spam"}, headers=token(ALICE))
    client.post(f"/reviews/{review_id(client, CAROL)}/block-author", headers=token(ALICE))
    client.post(f"/reviews/{review_id(client, ALICE)}/block-author", headers=token(DAN))

    assert client.delete("/me", headers=token(ALICE)).status_code == 204
    assert deleted == [ALICE]
    assert sorted(visible_to(client)) == ["bob", "carol"]
    with psycopg.connect("postgresql://crous:crous@localhost:5434/crous_test") as conn:
        leftovers = conn.execute(
            "SELECT (SELECT count(*) FROM report WHERE reporter = %(u)s)"
            " + (SELECT count(*) FROM block WHERE blocker = %(u)s OR blocked = %(u)s)",
            {"u": ALICE},
        ).fetchone()[0]
    assert leftovers == 0


def test_delete_account_reports_auth_failure_after_purging_data(client, monkeypatch):
    import httpx

    async def supabase_down(user_id):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(auth, "delete_auth_user", supabase_down)
    client.put("/restaurants/21/reviews/mine", json={"rating": 1, "comment": "alice"}, headers=token(ALICE))
    assert client.delete("/me", headers=token(ALICE)).status_code == 502  # app tells the user to retry
    assert visible_to(client) == []  # our data is already gone; the retry only has Supabase left to do
    assert client.delete("/me").status_code == 401
