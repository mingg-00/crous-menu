import asyncio
import logging
import math
import os
import re
import time
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
from app.translate import LANGUAGES, translate_now, translate_reviews, translate_texts

Lang = Literal[("fr", *LANGUAGES)]  # type: ignore[valid-type]

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
    allow_headers=["Authorization", "Content-Type"],
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


GROCERY = 3  # upstream type "Épicerie": only kept when it publishes menus (some sell hot lunches, e.g. Market' BUST)
_CLOSURE = re.compile(r"\bferm(é|e|eture)\b", re.I)


async def publishes_menus(code: int) -> bool:
    """Whether upstream has any menu from today on (one call returns them all)."""
    return bool(await upstream(f"/restaurants/{code}/menu", ttl=3600))


def is_student_place(r: dict) -> bool:
    # ponytail: name check because upstream types some staff canteens as plain "Restaurant"
    # (e.g. "Restaurant administratif Le Haut-Carré"); drop it if upstream fixes the typing.
    return (r.get("type") or {}).get("code") in STUDENT_TYPES and "administratif" not in r["nom"].lower()


@app.get("/restaurants/nearby")
async def nearby(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    limit: int = Query(10, ge=1, le=50),
    within_km: float = Query(0, ge=0, le=50, description="also include every restaurant this close, beyond `limit`"),
):
    restaurants = await upstream("/restaurants", ttl=6 * 3600) or []
    located = [
        (distance_km(lat, lng, r["latitude"], r["longitude"]), r)
        for r in restaurants
        if r.get("latitude") is not None
        and r.get("longitude") is not None
        and (is_student_place(r) or (r.get("type") or {}).get("code") == GROCERY)
    ]
    ranked = sorted(located, key=lambda t: t[0])
    # The nearest `limit`, plus the rest of the city. ponytail: capped at 30 (/restaurants/today's limit); Paris has more.
    ranked = [t for i, t in enumerate(ranked) if i < limit or t[0] <= within_km][: max(limit, 30)]
    # Menus decide the two cases the free-text data can't: groceries without menus are dropped, and a place whose
    # hours mention a closure counts as closed only while it has no menus (strike notices stay in the text for weeks).
    # Only those few places cost a call, cached for an hour.
    doubtful = [r for _, r in ranked if (r.get("type") or {}).get("code") == GROCERY or _CLOSURE.search(" ".join(r.get("horaires") or []))]
    has_menus = dict(zip((r["code"] for r in doubtful), await asyncio.gather(*(publishes_menus(r["code"]) for r in doubtful))))
    ranked = [(d, r) for d, r in ranked if has_menus.get(r["code"], True) or (r.get("type") or {}).get("code") != GROCERY]
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
            "closed": not has_menus.get(r["code"], True),
        }
        for d, r in ranked
    ]


def today() -> date:
    return datetime.now(PARIS).date()


def menu_path(code: int, day: date) -> str:
    return f"/restaurants/{code}/menu/{day:%d-%m-%Y}"


def menu_lines(meals: list[dict]) -> list[str]:
    """A menu's lines in menu order: the batch sent to the LLM, both on demand and when prewarming."""
    return [t for m in meals for c in m["categories"] for t in (c["libelle"], *(p["libelle"] for p in c["plats"]))]


@app.get("/restaurants/{code}/menu")
async def menu(
    code: int,
    day: date | None = Query(None, alias="date"),
    lang: Lang = "fr",
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
        tr, translating = await translate_texts(menu_lines(meals), lang)
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
    lang: Lang | None = Query(None, description="also give each comment translated into this language"),
    viewer: str | None = Depends(optional_user),
):
    rows = await db.list_reviews(code, day, meal, viewer)  # no date: every day, newest first
    average = round(sum(r["rating"] for r in rows) / len(rows), 1) if rows else None
    translating = False
    if lang:
        tr, translating = await translate_reviews({r["id"]: r["comment"] for r in rows if r["comment"] and not r["mine"]}, lang)
        for r in rows:
            # None when there is nothing to show: no comment, the viewer's own, or already in their language.
            dst = tr.get(r["id"])
            r["translation"] = dst if dst and dst.strip() != r["comment"].strip() else None
    # `today` lets the app tell which review is editable: writes only accept today's meal.
    # translating: some comments are still untranslated; they land within ~10s, so the app re-fetches.
    return {"count": len(rows), "average": average, "today": today().isoformat(), "reviews": rows, "translating": translating}


async def require_meal_today(code: int, meal: str) -> date:
    """Today's date if `meal` is on this restaurant's menu today; reviews only accept those."""
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


@app.delete("/reviews/{review_id}", status_code=204)
async def remove_review(review_id: int, user: str = Depends(current_user)):
    """Delete the caller's own review, from any day. Someone else's review answers 404, same as a missing one."""
    if not await db.delete_review(review_id, user):
        raise HTTPException(404, "No such review of yours")


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


PREWARM_TOKEN = os.environ.get("PREWARM_TOKEN", "")
TALENCE = (44.8065, -0.6032)  # the app's default center; prewarming covers the student places around it
PREWARM_RADIUS_KM = 20  # ponytail: Bordeaux area only (~15 places); widen if the app spreads to other cities


@app.post("/admin/prewarm")
async def prewarm(days: int = Query(7, ge=1, le=14), authorization: str | None = Header(None)):
    """Translate the coming days' menus into every language before anyone opens them, so nobody waits ~10s.

    Run daily by .github/workflows/prewarm.yml (menus are published about a week ahead). Each menu goes to the
    LLM as its own batch in menu order, exactly as on demand, so quality is unchanged; lines already cached
    are skipped. Anything it misses (a menu edited later, a place farther away) still translates on demand."""
    if not PREWARM_TOKEN or authorization != f"Bearer {PREWARM_TOKEN}":
        raise HTTPException(401, "Bad prewarm token")
    # Called as a function, so every parameter is passed: Query() defaults only resolve for HTTP requests.
    places = [r for r in await nearby(lat=TALENCE[0], lng=TALENCE[1], limit=50, within_km=0) if r["distance_km"] <= PREWARM_RADIUS_KM]
    start = today()
    menus = []
    for offset in range(days):
        for r in places:
            try:
                data = await upstream(menu_path(r["code"], date.fromordinal(start.toordinal() + offset)), ttl=3600)
            except HTTPException:
                continue  # upstream hiccup on one menu: skip it, it translates on demand
            if data:
                menus.append(menu_lines(data["repas"]))
    gate = asyncio.Semaphore(8)  # ponytail: fixed concurrency, kind to OpenAI rate limits

    async def one(lines: list[str], lang: str) -> int:
        async with gate:
            return await translate_now(lines, lang)

    sent = await asyncio.gather(*(one(lines, lang) for lines in menus for lang in LANGUAGES))
    return {"places": len(places), "menus": len(menus), "lines_sent": sum(sent)}


@app.get("/health")
async def health():
    return {"ok": True}



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
    sections = (
        [c for c in lunch["categories"] if _MAIN_SECTION.search(c["libelle"])]
        or lunch["categories"][1:2]  # unknown names: the section after the starters
        or lunch["categories"][:1]  # a single section ("Menu", "Snacking chaud et froid")
    )
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
    lang: Lang = "fr",
):
    """Per restaurant: today's lunch preview and the lunch star rating over all days (null with no reviews).
    Separate from /nearby so the list shows at once."""
    try:
        wanted = list(dict.fromkeys(int(c) for c in codes.split(",") if c.strip()))[:30]
    except ValueError:
        raise HTTPException(422, "codes must be comma-separated integers")
    day = today()
    menus = await asyncio.gather(*(upstream(menu_path(c, day), ttl=3600) for c in wanted))
    previews = {c: main_dish(m) for c, m in zip(wanted, menus)}
    pending: set[int] = set()
    if lang != "fr":
        tr, _ = await translate_texts([p for p in previews.values() if p], lang)
        pending = {c for c, p in previews.items() if p and p not in tr}
        previews = {c: tr.get(p, p) if p else None for c, p in previews.items()}
    ratings = await db.rating_summary(wanted, "midi")
    # translating: this preview is still French; its translation lands within ~10s, so the app re-fetches.
    return {str(c): {"preview": previews[c], "rating": ratings.get(c), "translating": c in pending} for c in wanted}


_MONTHS = "janvier février mars avril mai juin juillet août septembre octobre novembre décembre".split()
_TIME = re.compile(r"\b\d{1,2}\s*h\s*\d{0,2}", re.I)
_DATE = re.compile(r"\b(\d{1,2})(?:er)?\s+(" + "|".join(_MONTHS) + r")\b", re.I)


def is_past_notice(line: str, day: date) -> bool:
    """A one-off announcement whose date has passed ("Ouverture officielle le lundi 26 janvier").

    Upstream leaves these in the opening hours for months and without a year. Notices go up shortly before the
    date, so a date counts as upcoming only within the next ~3 months; later than that it is last year's
    (in December, "5 janvier" is next month; in October, "26 janvier" was last January). Undated lines and
    upcoming notices (a closure next week) are kept, and so are hours that start on a date."""
    m = _DATE.search(line)
    if not m or len(_TIME.findall(line)) >= 2:
        return False  # undated, or hours that apply from that date on ("A partir du 23 mai : 7h30-15h")
    try:
        when = date(day.year, _MONTHS.index(m.group(2).lower()) + 1, int(m.group(1)))
        if (when - day).days > 90:
            when = when.replace(year=day.year - 1)
        elif (when - day).days < -270:
            when = when.replace(year=day.year + 1)
    except ValueError:
        return False  # not a real date ("31 février", 29 février in another year): leave the line alone
    return when < day


@app.get("/restaurants/{code}")
async def restaurant(code: int, lang: Lang = "fr"):
    """What a newcomer needs to get there and pay: address, opening hours (translated), transit, payment, phone."""
    r = await upstream(f"/restaurants/{code}", ttl=6 * 3600)
    if not r:
        raise HTTPException(404, "No such restaurant")
    hours = [h for h in r.get("horaires") or [] if h.strip() and not is_past_notice(h, today())]
    translating = False
    if lang != "fr" and hours:
        tr, translating = await translate_texts(hours, lang)
        hours = [tr.get(h, h) for h in hours]
    return {
        "code": r["code"],
        "nom": r["nom"],
        "adresse": r.get("adresse"),
        "latitude": r.get("latitude"),
        "longitude": r.get("longitude"),
        "horaires": hours,
        "acces": r.get("acces") or [],
        "paiement": r.get("paiement") or [],
        "telephone": r.get("telephone"),
        "translating": translating,
    }
