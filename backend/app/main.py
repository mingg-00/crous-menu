import math
import time
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, HTTPException, Query

from app import db
from app.translate import translate_texts

UPSTREAM = "https://api.croustillant.menu/v1"
PARIS = ZoneInfo("Europe/Paris")
STUDENT_TYPES = {1, 2}  # upstream /restaurants/types: 1 Restaurant, 2 Cafétéria


@asynccontextmanager
async def lifespan(_: FastAPI):
    await db.init()
    yield
    await db.pool.close()


app = FastAPI(title="Crous App API", lifespan=lifespan)
client = httpx.AsyncClient(base_url=UPSTREAM, timeout=10)

# All app users share this server's IP against the upstream 200 req/min limit, so cache responses.
# ponytail: per-process in-memory cache, fine for a single instance; use a shared cache if scaled out.
_cache: dict[str, tuple[float, object]] = {}


async def upstream(path: str, ttl: int):
    """GET a CROUStillant path and return its `data`, or None if upstream says 404."""
    hit = _cache.get(path)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    try:
        r = await client.get(path)
    except httpx.HTTPError:
        raise HTTPException(502, "Menu provider unreachable")
    if r.status_code == 404:
        data = None
    elif r.is_success:
        data = r.json()["data"]
    else:
        raise HTTPException(502, "Menu provider error")
    _cache[path] = (time.time(), data)
    return data


def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Haversine great-circle distance."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def is_student_place(r: dict) -> bool:
    # ponytail: name check because upstream types some staff canteens as plain "Restaurant"
    # (e.g. "Restaurant administratif Le Haut-Carré"); drop it if upstream fixes the typing.
    return (r.get("type") or {}).get("code") in STUDENT_TYPES and "administratif" not in r["nom"].lower()


@app.get("/restaurants/nearby")
async def nearby(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    limit: int = Query(10, ge=1, le=50),
):
    restaurants = await upstream("/restaurants", ttl=6 * 3600) or []
    located = [
        (distance_km(lat, lng, r["latitude"], r["longitude"]), r)
        for r in restaurants
        if r.get("latitude") is not None and r.get("longitude") is not None and is_student_place(r)
    ]
    ranked = sorted(located, key=lambda t: t[0])[:limit]
    return [
        {
            "code": r["code"],
            "nom": r["nom"],
            "type": (r.get("type") or {}).get("libelle"),
            "adresse": r.get("adresse"),
            "horaires": r.get("horaires", []),
            "image_url": r.get("image_url"),
            "distance_km": round(d, 2),
        }
        for d, r in ranked
    ]


@app.get("/restaurants/{code}/menu")
async def menu(
    code: int,
    day: date | None = Query(None, alias="date"),
    lang: Literal["fr", "en", "ko"] = "fr",
):
    day = day or datetime.now(PARIS).date()
    data = await upstream(f"/restaurants/{code}/menu/{day:%d-%m-%Y}", ttl=3600)
    if not data:
        raise HTTPException(404, "No menu for this date")
    meals = [
        {
            "type": m["type"],
            "categories": [
                {"libelle": c["libelle"], "plats": [{"code": p["code"], "libelle": p["libelle"]} for p in c["plats"]]}
                for c in m["categories"]
            ],
        }
        for m in data["repas"]
    ]
    if lang != "fr":
        texts = {c["libelle"] for m in meals for c in m["categories"]} | {
            p["libelle"] for m in meals for c in m["categories"] for p in c["plats"]
        }
        tr = await translate_texts(texts, lang)
        for m in meals:
            for c in m["categories"]:
                c["libelle"] = tr.get(c["libelle"], c["libelle"])
                for p in c["plats"]:
                    p["libelle"] = tr.get(p["libelle"], p["libelle"])
    return {"date": day.isoformat(), "repas": meals}
