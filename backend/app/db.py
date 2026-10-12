import os

from psycopg_pool import AsyncConnectionPool

from app.dburl import parse_database_url

pool = AsyncConnectionPool(
    "", kwargs=parse_database_url(os.environ.get("DATABASE_URL", "postgresql://crous:crous@localhost:5434/crous")), open=False
)


# ponytail: fixed threshold, no moderator UI; reported reviews are reviewed with SQL on the `report` table.
HIDE_AFTER_REPORTS = 3


async def init():
    """Open the pool and fail fast if the DB is unreachable. The schema is managed by Alembic (migrations/)."""
    await pool.open(wait=True, timeout=10)


async def get_translations(texts: set[str], lang: str) -> dict[str, str]:
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT src, dst FROM translation WHERE lang = %s AND src = ANY(%s)", (lang, list(texts))
        )
        return dict(await cur.fetchall())


async def list_reviews(restaurant: int, day, meal: str, viewer: str | None) -> list[dict]:
    """Reviews of one meal (of every day when `day` is None), newest first, minus what the viewer reported or whose author they blocked, and minus reviews
    reported by HIDE_AFTER_REPORTS people (still shown to their author)."""
    async with pool.connection() as conn:
        cur = await conn.execute(
            """SELECT r.id, r.rating, r.comment, r.day, r.created_at, COALESCE(r.user_id = %(viewer)s::uuid, false) AS mine
               FROM review r
               WHERE r.restaurant = %(restaurant)s AND (%(day)s::date IS NULL OR r.day = %(day)s) AND r.meal = %(meal)s
                 AND (r.user_id = %(viewer)s::uuid
                      OR (SELECT count(*) FROM report p WHERE p.review_id = r.id) < %(hide_after)s)
                 AND NOT EXISTS (SELECT 1 FROM report p WHERE p.review_id = r.id AND p.reporter = %(viewer)s::uuid)
                 AND NOT EXISTS (SELECT 1 FROM block b WHERE b.blocker = %(viewer)s::uuid AND b.blocked = r.user_id)
               ORDER BY r.created_at DESC LIMIT 200""",  # ponytail: no pagination; with all days, the list and its average cover the latest 200
            {"viewer": viewer, "restaurant": restaurant, "day": day, "meal": meal, "hide_after": HIDE_AFTER_REPORTS},
        )
        cols = [c.name for c in cur.description]
        return [dict(zip(cols, row)) for row in await cur.fetchall()]


async def review_author(review_id: int) -> str | None:
    async with pool.connection() as conn:
        cur = await conn.execute("SELECT user_id::text FROM review WHERE id = %s", (review_id,))
        row = await cur.fetchone()
        return row[0] if row else None


async def report_review(review_id: int, reporter: str, reason: str):
    async with pool.connection() as conn:
        await conn.execute(
            "INSERT INTO report (review_id, reporter, reason) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
            (review_id, reporter, reason),
        )


async def block_user(blocker: str, blocked: str):
    async with pool.connection() as conn:
        await conn.execute(
            "INSERT INTO block (blocker, blocked) VALUES (%s, %s) ON CONFLICT DO NOTHING", (blocker, blocked)
        )


async def upsert_review(restaurant: int, day, meal: str, user: str, rating: int, comment: str):
    async with pool.connection() as conn:
        cur = await conn.execute(
            """INSERT INTO review (restaurant, day, meal, user_id, rating, comment)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (restaurant, day, meal, user_id)
               DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = now()
               RETURNING id""",
            (restaurant, day, meal, user, rating, comment),
        )
        # The comment may have changed: its old translations are stale.
        await conn.execute("DELETE FROM review_translation WHERE review_id = %s", ((await cur.fetchone())[0],))


async def delete_review(review_id: int, user: str) -> bool:
    """Delete one of the user's own reviews (any day). False if it doesn't exist or isn't theirs."""
    async with pool.connection() as conn:
        cur = await conn.execute("DELETE FROM review WHERE id = %s AND user_id = %s", (review_id, user))
        return cur.rowcount > 0


async def save_translations(pairs: dict[str, str], lang: str):
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.executemany(
                "INSERT INTO translation (src, lang, dst) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                [(src, lang, dst) for src, dst in pairs.items()],
            )


async def delete_user_data(user: str):
    """Everything this app stores about a user, in one transaction. Reports on their reviews go via ON DELETE CASCADE."""
    async with pool.connection() as conn:
        await conn.execute("DELETE FROM review WHERE user_id = %s", (user,))
        await conn.execute("DELETE FROM report WHERE reporter = %s", (user,))
        await conn.execute("DELETE FROM block WHERE blocker = %s OR blocked = %s", (user, user))


async def get_review_translations(ids: list[int], lang: str) -> dict[int, str]:
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT review_id, dst FROM review_translation WHERE lang = %s AND review_id = ANY(%s)", (lang, ids)
        )
        return dict(await cur.fetchall())


async def save_review_translations(rows: list[tuple[int, str, str]], lang: str):
    """rows: (review_id, source comment, translation). A row is kept only if the review still exists with that same
    comment, so an edit or delete during the ~10s LLM call never leaves a stale or orphaned translation."""
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.executemany(
                """INSERT INTO review_translation (review_id, lang, dst)
                   SELECT id, %s, %s FROM review WHERE id = %s AND comment = %s
                   ON CONFLICT DO NOTHING""",
                [(lang, dst, review_id, src) for review_id, src, dst in rows],
            )


async def rating_summary(restaurants: list[int], meal: str) -> dict[int, dict]:
    """Average stars and review count per restaurant over all days, leaving out reviews hidden by reports."""
    async with pool.connection() as conn:
        cur = await conn.execute(
            """SELECT restaurant, round(avg(rating), 1)::float, count(*) FROM review r
               WHERE restaurant = ANY(%s) AND meal = %s
                 AND (SELECT count(*) FROM report p WHERE p.review_id = r.id) < %s
               GROUP BY restaurant""",
            (restaurants, meal, HIDE_AFTER_REPORTS),
        )
        return {restaurant: {"average": average, "count": n} for restaurant, average, n in await cur.fetchall()}
