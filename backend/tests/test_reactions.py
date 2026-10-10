import uuid

import psycopg
import pytest

from app import main
from tests.conftest import TEST_DB

PHONE, LAPTOP, FRIEND = (str(uuid.uuid4()) for _ in range(3))
TODAY_MENU = {"repas": [{"type": "midi", "categories": []}]}


def device(voter):
    return {"X-Client-Id": voter}


@pytest.fixture(autouse=True)
def setup(client, monkeypatch):
    async def upstream(path, ttl):
        return TODAY_MENU if path in (main.menu_path(21, main.today()), main.menu_path(26, main.today())) else None

    monkeypatch.setattr(main, "upstream", upstream)
    with psycopg.connect(TEST_DB, autocommit=True) as conn:
        conn.execute("TRUNCATE reaction")


def react(client, voter, kind, code=21):
    return client.put(f"/restaurants/{code}/reactions/mine", json={"kind": kind}, headers=device(voter)).status_code


def test_one_reaction_per_device_counts_and_mine(client):
    assert react(client, PHONE, "meh") == 204
    assert react(client, PHONE, "yum") == 204  # changing replaces, never adds a second vote
    react(client, LAPTOP, "yum")
    react(client, FRIEND, "bad")
    assert client.get("/restaurants/21/reactions", headers=device(PHONE)).json() == {
        "counts": {"yum": 2, "bad": 1}, "mine": "yum"}
    assert client.get("/restaurants/21/reactions").json()["mine"] is None  # no device id: counts only

    assert client.delete("/restaurants/21/reactions/mine", headers=device(PHONE)).status_code == 204
    assert client.get("/restaurants/21/reactions", headers=device(PHONE)).json() == {
        "counts": {"yum": 1, "bad": 1}, "mine": None}


def test_rejects_bad_input(client):
    assert client.put("/restaurants/21/reactions/mine", json={"kind": "yum"}).status_code == 400  # no device id
    assert client.put("/restaurants/21/reactions/mine", json={"kind": "yum"}, headers=device("abc")).status_code == 400
    assert react(client, PHONE, "love") == 422
    assert react(client, PHONE, "yum", code=999) == 404  # no menu today
    assert client.put("/restaurants/21/reactions/mine", params={"meal": "soir"}, json={"kind": "yum"},
                      headers=device(PHONE)).status_code == 404


def test_today_summary_merges_previews_and_counts(client, monkeypatch):
    menus = {
        main.menu_path(21, main.today()): {"repas": [{"type": "midi", "categories": [
            {"libelle": "Entrées", "plats": [{"code": 1, "libelle": "Tomates"}]},
            {"libelle": "Plat du jour", "plats": [{"code": 2, "libelle": "Merlu sauce basilic"}]}]}]},
    }

    async def upstream(path, ttl):
        return menus.get(path)

    async def translate(texts, lang):
        return {"Merlu sauce basilic": "Hake, basil sauce"}, False

    monkeypatch.setattr(main, "upstream", upstream)
    monkeypatch.setattr(main, "translate_texts", translate)
    with psycopg.connect(TEST_DB, autocommit=True) as conn:
        conn.execute("INSERT INTO reaction (restaurant, day, meal, voter, kind) VALUES (21, %s, 'midi', %s, 'yum')",
                     (main.today(), PHONE))
    body = client.get("/restaurants/today", params={"codes": "21,26,21", "lang": "en"}).json()
    assert body == {"21": {"preview": "Hake, basil sauce", "counts": {"yum": 1}},
                    "26": {"preview": None, "counts": {}}}  # closed today; duplicates collapsed
    assert client.get("/restaurants/today", params={"codes": "21,x"}).status_code == 422
