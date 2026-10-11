"""Review comments translated into the viewer's language, and the star rating on the list cards."""
import time

import psycopg

from app import main, translate
from tests.conftest import TEST_DB
from tests.test_reviews import ALICE, BOB, CAROL, setup, token  # noqa: F401 (setup: autouse fixture)


def fake_llm(calls):
    async def llm(texts, lang, model=None, prompt=None):
        calls.append(list(texts))
        # "Bon" stands for a comment already in English: the model returns it unchanged.
        return {s: s if s == "Bon" else f"{s} [{lang}]" for s in texts}

    return llm


def reviews(client, viewer=None, lang="en"):
    """Fetch until background translations have landed (they run in the app's event loop between requests)."""
    headers = token(viewer) if viewer else {}
    for _ in range(50):
        body = client.get("/restaurants/21/reviews", params={"lang": lang}, headers=headers).json()
        if not body["translating"]:
            return {r["comment"]: r["translation"] for r in body["reviews"]}
        time.sleep(0.02)
    raise AssertionError("translations never landed")


def test_comments_are_translated_once_and_edits_retranslate(client, monkeypatch):
    calls = []
    monkeypatch.setattr(translate, "llm_translate", fake_llm(calls))
    client.put("/restaurants/21/reviews/mine", json={"rating": 4, "comment": "Très bon"}, headers=token(ALICE))
    client.put("/restaurants/21/reviews/mine", json={"rating": 5, "comment": "Bon"}, headers=token(BOB))
    client.put("/restaurants/21/reviews/mine", json={"rating": 3}, headers=token(CAROL))

    first = client.get("/restaurants/21/reviews", params={"lang": "en"}).json()
    assert first["translating"] and all(r["translation"] is None for r in first["reviews"])  # originals meanwhile
    assert reviews(client) == {"Très bon": "Très bon [en]", "Bon": None, "": None}  # unchanged text: no translation
    assert reviews(client) and len(calls) == 1  # cached
    assert reviews(client, ALICE) == {"Très bon": None, "Bon": None, "": None}  # your own review isn't translated
    assert "translation" not in client.get("/restaurants/21/reviews").json()["reviews"][0]  # no lang, no translation

    client.put("/restaurants/21/reviews/mine", json={"rating": 2, "comment": "Trop salé"}, headers=token(ALICE))
    assert reviews(client) == {"Trop salé": "Trop salé [en]", "Bon": None, "": None}


def test_translation_racing_an_edit_or_delete_is_dropped(client):
    import asyncio

    from app import db

    client.put("/restaurants/21/reviews/mine", json={"rating": 4, "comment": "Avant"}, headers=token(ALICE))
    rid = next(r["id"] for r in client.get("/restaurants/21/reviews").json()["reviews"])
    client.put("/restaurants/21/reviews/mine", json={"rating": 4, "comment": "Après"}, headers=token(ALICE))

    async def save():
        await db.pool.open()
        await db.save_review_translations([(rid, "Avant", "Before"), (999999, "x", "y")], "en")

    asyncio.run(save())
    with psycopg.connect(TEST_DB) as conn:
        assert conn.execute("SELECT count(*) FROM review_translation").fetchone()[0] == 0


def test_deleting_a_review_deletes_its_translations(client, monkeypatch):
    monkeypatch.setattr(translate, "llm_translate", fake_llm([]))
    client.put("/restaurants/21/reviews/mine", json={"rating": 4, "comment": "Très bon"}, headers=token(ALICE))
    reviews(client)
    client.delete("/restaurants/21/reviews/mine", headers=token(ALICE))
    with psycopg.connect(TEST_DB) as conn:
        assert conn.execute("SELECT count(*) FROM review_translation").fetchone()[0] == 0


def test_today_summary_merges_previews_and_star_ratings(client, monkeypatch):
    menus = {
        main.menu_path(21, main.today()): {"repas": [{"type": "midi", "categories": [
            {"libelle": "Entrées", "plats": [{"code": 1, "libelle": "Tomates"}]},
            {"libelle": "Plat du jour", "plats": [{"code": 2, "libelle": "Merlu sauce basilic"}]}]}]},
    }

    async def upstream(path, ttl):
        return menus.get(path)

    async def translate_texts(texts, lang):
        return {"Merlu sauce basilic": "Hake, basil sauce"}, False

    monkeypatch.setattr(main, "translate_texts", translate_texts)
    client.put("/restaurants/21/reviews/mine", json={"rating": 4}, headers=token(ALICE))
    client.put("/restaurants/21/reviews/mine", json={"rating": 5}, headers=token(BOB))
    with psycopg.connect(TEST_DB, autocommit=True) as conn:  # an older day counts too
        conn.execute("INSERT INTO review (restaurant, day, meal, user_id, rating) VALUES (21, current_date - 2, 'midi', %s, 3)",
                     (CAROL,))
    monkeypatch.setattr(main, "upstream", upstream)
    body = client.get("/restaurants/today", params={"codes": "21,26,21", "lang": "en"}).json()
    assert body == {"21": {"preview": "Hake, basil sauce", "rating": {"average": 4.0, "count": 3}},
                    "26": {"preview": None, "rating": None}}  # closed today, no reviews; duplicates collapsed
    assert client.get("/restaurants/today", params={"codes": "21,x"}).status_code == 422
