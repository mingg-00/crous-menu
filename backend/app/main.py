import asyncio
import logging
import math
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app import db
from app import auth
from app.auth import current_user, optional_user
from app.moderation import is_flagged
from app.translate import translate_texts

UPSTREAM = "https://api.croustillant.menu/v1"


class _RedactCoordinates(logging.Filter):
    """The privacy policy promises we don't store users' coordinates, so keep them out of access logs."""

    def filter(self, record):
        record.args = tuple(re.sub(r"(lat|lng)=[^&\s]+", r"\1=REDACTED", a) if isinstance(a, str) else a for a in record.args or ())
        return True


logging.getLogger("uvicorn.access").addFilter(_RedactCoordinates())
PARIS = ZoneInfo("Europe/Paris")
STUDENT_TYPES = {1, 2}  # upstream /restaurants/types: 1 Restaurant, 2 Cafétéria


@asynccontextmanager
async def lifespan(_: FastAPI):
    await db.init()
    yield
    await db.pool.close()


app = FastAPI(title="Crous App API", lifespan=lifespan)
# The web build calls this API from another origin; native apps don't send Origin and aren't affected.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "http://localhost:8081").split(","),
    allow_methods=["GET", "PUT", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Client-Id"],
)
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
            "latitude": r["latitude"],  # for the map
            "longitude": r["longitude"],
        }
        for d, r in ranked
    ]


def today() -> date:
    return datetime.now(PARIS).date()


def menu_path(code: int, day: date) -> str:
    return f"/restaurants/{code}/menu/{day:%d-%m-%Y}"


@app.get("/restaurants/{code}/menu")
async def menu(
    code: int,
    day: date | None = Query(None, alias="date"),
    lang: Literal["fr", "en", "ko"] = "fr",
):
    day = day or today()
    data = await upstream(menu_path(code, day), ttl=3600)
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
    translating = False
    if lang != "fr":
        texts = [t for m in meals for c in m["categories"] for t in (c["libelle"], *(p["libelle"] for p in c["plats"]))]
        tr, translating = await translate_texts(texts, lang)
        for m in meals:
            for c in m["categories"]:
                c["libelle"] = tr.get(c["libelle"], c["libelle"])
                for p in c["plats"]:
                    p["libelle"] = tr.get(p["libelle"], p["libelle"])
    # translating: some lines are still French; translations land within ~10s, so the app re-fetches.
    return {"date": day.isoformat(), "repas": meals, "translating": translating}


Meal = Literal["matin", "midi", "soir"]


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field("", max_length=500)


@app.get("/restaurants/{code}/reviews")
async def reviews(
    code: int,
    day: date | None = Query(None, alias="date"),
    meal: Meal = "midi",
    viewer: str | None = Depends(optional_user),
):
    rows = await db.list_reviews(code, day or today(), meal, viewer)
    average = round(sum(r["rating"] for r in rows) / len(rows), 1) if rows else None
    return {"count": len(rows), "average": average, "reviews": rows}


async def require_meal_today(code: int, meal: str) -> date:
    """Today's date if `meal` is on this restaurant's menu today; reviews and reactions only accept those."""
    day = today()
    data = await upstream(menu_path(code, day), ttl=3600)
    if not data or meal not in {m["type"] for m in data["repas"]}:
        raise HTTPException(404, "This meal is not on today's menu")
    return day


@app.put("/restaurants/{code}/reviews/mine", status_code=204)
async def write_review(code: int, body: ReviewIn, meal: Meal = "midi", user: str = Depends(current_user)):
    """Create or replace the caller's review of today's meal. Only meals actually on today's menu."""
    day = await require_meal_today(code, meal)
    comment = body.comment.strip()
    if await is_flagged(comment):
        raise HTTPException(422, "comment_rejected")  # the app shows its own localized message for this code
    await db.upsert_review(code, day, meal, user, body.rating, comment)


@app.delete("/restaurants/{code}/reviews/mine", status_code=204)
async def remove_review(code: int, meal: Meal = "midi", user: str = Depends(current_user)):
    if not await db.delete_review(code, today(), meal, user):
        raise HTTPException(404, "No review to delete")


class ReportIn(BaseModel):
    reason: Literal["spam", "offensive"]


async def others_review_author(review_id: int, user: str) -> str:
    author = await db.review_author(review_id)
    if author is None:
        raise HTTPException(404, "No such review")
    if author == user:
        raise HTTPException(400, "That is your own review")
    return author


@app.post("/reviews/{review_id}/report", status_code=204)
async def report(review_id: int, body: ReportIn, user: str = Depends(current_user)):
    await others_review_author(review_id, user)
    await db.report_review(review_id, user, body.reason)


@app.post("/reviews/{review_id}/block-author", status_code=204)
async def block_author(review_id: int, user: str = Depends(current_user)):
    await db.block_user(user, await others_review_author(review_id, user))


@app.delete("/me", status_code=204)
async def delete_account(user: str = Depends(current_user)):
    """In-app account deletion (App Store 5.1.1(v), GDPR erasure). Our data first: if Supabase then fails, a retry
    finishes the job, whereas the reverse order could leave data with no account to delete it from."""
    await db.delete_user_data(user)
    try:
        await auth.delete_auth_user(user)
    except httpx.HTTPError:
        raise HTTPException(502, "Could not delete the login account, please retry")


@app.get("/health")
async def health():
    return {"ok": True}



# Reactions: one-tap emoji per anonymous device (X-Client-Id: a random UUID the app keeps), no login needed so that
# far more people react than write reviews. ponytail: a cleared device can vote again; add per-IP rate limits if abused.
Reaction = Literal["yum", "good", "meh", "bad"]


def _client_id(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise HTTPException(400, "X-Client-Id must be a UUID")


def client_id(x_client_id: str | None = Header(None)) -> str:
    if x_client_id is None:
        raise HTTPException(400, "X-Client-Id header required")
    return _client_id(x_client_id)


def optional_client_id(x_client_id: str | None = Header(None)) -> str | None:
    return _client_id(x_client_id)


class ReactionIn(BaseModel):
    kind: Reaction


@app.get("/restaurants/{code}/reactions")
async def reactions(code: int, meal: Meal = "midi", voter: str | None = Depends(optional_client_id)):
    day = today()
    counts = (await db.reaction_counts([code], day, meal)).get(code, {})
    return {"counts": counts, "mine": await db.my_reaction(code, day, meal, voter) if voter else None}


@app.put("/restaurants/{code}/reactions/mine", status_code=204)
async def react(code: int, body: ReactionIn, meal: Meal = "midi", voter: str = Depends(client_id)):
    await db.set_reaction(code, await require_meal_today(code, meal), meal, voter, body.kind)


@app.delete("/restaurants/{code}/reactions/mine", status_code=204)
async def unreact(code: int, meal: Meal = "midi", voter: str = Depends(client_id)):
    await db.delete_reaction(code, today(), meal, voter)


_MAIN_SECTION = re.compile(r"plat|grill|traditionnel|cha[iî]ne|cuisine|wok|pizza|pasta", re.I)
_NOT_A_DISH = re.compile(r"non communiqu|ferm[ée]|sous r[ée]serve", re.I)


def main_dish(menu: dict | None) -> str | None:
    """A one-line preview of today's lunch: the first regular dish of a main-course section.

    Skips labels ("Alternative sans viande :") and the meat-free alternative that follows them, so the preview
    is the dish most people get. ponytail: keyword heuristic over free-text Crous section names.
    """
    lunch = next((m for m in (menu or {}).get("repas", []) if m["type"] == "midi"), None)
    if not lunch:
        return None
    sections = [c for c in lunch["categories"] if _MAIN_SECTION.search(c["libelle"])] or lunch["categories"][1:2]
    for section in sections:
        for plat in section["plats"]:
            text = plat["libelle"].strip()
            if "alternative" in text.lower():
                break  # the rest of this section is the vegetarian alternative
            if text and not text.endswith(":") and not _NOT_A_DISH.search(text):
                return text
    return None


@app.get("/restaurants/today")
async def today_summary(
    codes: str = Query(description="comma-separated restaurant codes, at most 30"),
    lang: Literal["fr", "en", "ko"] = "fr",
):
    """Per restaurant: today's lunch preview and reaction counts. Separate from /nearby so the list shows at once."""
    try:
        wanted = list(dict.fromkeys(int(c) for c in codes.split(",") if c.strip()))[:30]
    except ValueError:
        raise HTTPException(422, "codes must be comma-separated integers")
    day = today()
    menus = await asyncio.gather(*(upstream(menu_path(c, day), ttl=3600) for c in wanted))
    previews = {c: main_dish(m) for c, m in zip(wanted, menus)}
    if lang != "fr":
        tr, _ = await translate_texts([p for p in previews.values() if p], lang)
        previews = {c: tr.get(p, p) if p else None for c, p in previews.items()}
    counts = await db.reaction_counts(wanted, day, "midi")
    return {str(c): {"preview": previews[c], "counts": counts.get(c, {})} for c in wanted}
