from fastapi.testclient import TestClient

from app import main

RESTO, CAFET, EPICERIE = {"code": 1}, {"code": 2}, {"code": 3}
AMAZONE = {"code": 21, "nom": "Resto U L'Amazone", "type": RESTO, "latitude": 44.806477, "longitude": -0.6031187}
PAU = {"code": 7, "nom": "Crous Cafet' L'Arlequin", "type": CAFET, "latitude": 43.316456, "longitude": -0.367087}
NO_COORDS = {"code": 99, "nom": "Unknown", "type": RESTO, "latitude": None, "longitude": None}
MARKET = {**AMAZONE, "code": 1660, "nom": "Crous Market' BUST", "type": EPICERIE}
STAFF = {**AMAZONE, "code": 20, "nom": "Restaurant administratif Le Haut-Carré"}
MENU = {
    "date": "06-10-2026",
    "repas": [{"type": "midi", "categories": [{"libelle": "Dessert", "plats": [{"code": 1, "ordre": 1, "libelle": "Fruit"}]}]}],
}


def fake_upstream(responses):
    calls = []

    async def upstream(path, ttl):
        calls.append(path)
        return responses.get(path)

    return upstream, calls


def test_nearby_sorts_by_distance_and_keeps_only_located_student_places(monkeypatch):
    same_building = {**AMAZONE, "code": 22, "nom": "Cafet' L'Amazone"}  # real data has identical coords
    up, _ = fake_upstream({"/restaurants": [PAU, NO_COORDS, AMAZONE, MARKET, STAFF, same_building]})
    monkeypatch.setattr(main, "upstream", up)
    res = TestClient(main.app).get("/restaurants/nearby", params={"lat": 44.80, "lng": -0.60})
    assert res.status_code == 200
    body = res.json()
    assert [r["code"] for r in body] == [21, 22, 7]
    assert body[0]["distance_km"] < 1 < body[-1]["distance_km"]


def test_menu_converts_iso_date_and_404s_when_missing(monkeypatch):
    up, calls = fake_upstream({"/restaurants/21/menu/06-10-2026": MENU})
    monkeypatch.setattr(main, "upstream", up)
    client = TestClient(main.app)

    res = client.get("/restaurants/21/menu", params={"date": "2026-10-06"})
    assert res.status_code == 200
    assert res.json()["repas"][0]["categories"][0]["plats"] == [{"code": 1, "libelle": "Fruit"}]
    assert calls == ["/restaurants/21/menu/06-10-2026"]

    assert client.get("/restaurants/21/menu", params={"date": "2026-10-07"}).status_code == 404


def test_menu_translates_dishes_and_categories_and_keeps_untranslated_french(monkeypatch):
    up, _ = fake_upstream({"/restaurants/21/menu/06-10-2026": MENU})
    monkeypatch.setattr(main, "upstream", up)
    asked = {}

    async def fake_translate(texts, lang):
        asked["texts"], asked["lang"] = texts, lang
        return {"Fruit": "과일"}, True  # "Dessert" deliberately missing -> stays French, still translating

    monkeypatch.setattr(main, "translate_texts", fake_translate)
    res = TestClient(main.app).get("/restaurants/21/menu", params={"date": "2026-10-06", "lang": "ko"})
    cat = res.json()["repas"][0]["categories"][0]
    assert (cat["libelle"], cat["plats"][0]["libelle"]) == ("Dessert", "과일")
    assert res.json()["translating"] is True
    assert asked == {"texts": ["Dessert", "Fruit"], "lang": "ko"}  # menu order, header first


def test_menu_in_french_skips_translation(monkeypatch):
    up, _ = fake_upstream({"/restaurants/21/menu/06-10-2026": MENU})
    monkeypatch.setattr(main, "upstream", up)

    async def must_not_run(*a):
        raise AssertionError("translate_texts called for lang=fr")

    monkeypatch.setattr(main, "translate_texts", must_not_run)
    res = TestClient(main.app).get("/restaurants/21/menu", params={"date": "2026-10-06"})
    assert res.json()["repas"][0]["categories"][0]["plats"][0]["libelle"] == "Fruit"
    assert res.json()["translating"] is False
    assert TestClient(main.app).get("/restaurants/21/menu", params={"lang": "de"}).status_code == 422


def test_distance_km_bordeaux_to_paris():
    assert 495 < main.distance_km(44.84, -0.58, 48.86, 2.35) < 505


def test_cors_allows_the_web_app_origin_only():
    client = TestClient(main.app)
    preflight = lambda origin: client.options(
        "/reviews/1/report",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization"},
    )
    ok = preflight("http://localhost:8081")
    assert ok.status_code == 200 and ok.headers["access-control-allow-origin"] == "http://localhost:8081"
    assert "access-control-allow-origin" not in preflight("https://evil.example").headers


def test_access_log_redacts_coordinates():
    import logging

    record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s"', ("1.2.3.4", "GET", "/restaurants/nearby?lat=44.80&lng=-0.60&limit=5"), None)
    for f in logging.getLogger("uvicorn.access").filters:
        f.filter(record)
    assert record.getMessage() == '1.2.3.4 - "GET /restaurants/nearby?lat=REDACTED&lng=REDACTED&limit=5"'
