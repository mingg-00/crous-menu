import os

from psycopg_pool import AsyncConnectionPool

pool = AsyncConnectionPool(
    os.environ.get("DATABASE_URL", "postgresql://crous:crous@localhost:5434/crous"), open=False
)

# ponytail: CREATE IF NOT EXISTS only; switch to Alembic at the first change to an existing table.
SCHEMA = """
CREATE TABLE IF NOT EXISTS translation (
    src  text NOT NULL,
    lang text NOT NULL,
    dst  text NOT NULL,
    PRIMARY KEY (src, lang)
);

-- One review per user per meal (restaurant + day + meal type), so ratings can't be stuffed.
CREATE TABLE IF NOT EXISTS review (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    restaurant int NOT NULL,
    day        date NOT NULL,
    meal       text NOT NULL,
    user_id    uuid NOT NULL,
    rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    text NOT NULL DEFAULT '' CHECK (length(comment) <= 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (restaurant, day, meal, user_id)
);

-- Edits keep the review id (upsert), so reports survive edits.
CREATE TABLE IF NOT EXISTS report (
    review_id  bigint NOT NULL REFERENCES review(id) ON DELETE CASCADE,
    reporter   uuid NOT NULL,
    reason     text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (review_id, reporter)
);

CREATE TABLE IF NOT EXISTS block (
    blocker    uuid NOT NULL,
    blocked    uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker, blocked)
);
"""

# ponytail: fixed threshold, no moderator UI; reported reviews are reviewed with SQL on the `report` table.
HIDE_AFTER_REPORTS = 3


async def init():
    await pool.open()
    async with pool.connection() as conn:
        await conn.execute(SCHEMA)


async def get_translations(texts: set[str], lang: str) -> dict[str, str]:
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT src, dst FROM translation WHERE lang = %s AND src = ANY(%s)", (lang, list(texts))
        )
        return dict(await cur.fetchall())


async def list_reviews(restaurant: int, day, meal: str, viewer: str | None) -> list[dict]:
    """Reviews of one meal, minus what the viewer reported or whose author they blocked, and minus reviews
    reported by HIDE_AFTER_REPORTS people (still shown to their author)."""
    async with pool.connection() as conn:
        cur = await conn.execute(
            """SELECT r.id, r.rating, r.comment, r.created_at, COALESCE(r.user_id = %(viewer)s::uuid, false) AS mine
               FROM review r
               WHERE r.restaurant = %(restaurant)s AND r.day = %(day)s AND r.meal = %(meal)s
                 AND (r.user_id = %(viewer)s::uuid
                      OR (SELECT count(*) FROM report p WHERE p.review_id = r.id) < %(hide_after)s)
                 AND NOT EXISTS (SELECT 1 FROM report p WHERE p.review_id = r.id AND p.reporter = %(viewer)s::uuid)
                 AND NOT EXISTS (SELECT 1 FROM block b WHERE b.blocker = %(viewer)s::uuid AND b.blocked = r.user_id)
               ORDER BY r.created_at DESC LIMIT 200""",  # ponytail: no pagination, one meal rarely gets 200
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
        await conn.execute(
            """INSERT INTO review (restaurant, day, meal, user_id, rating, comment)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (restaurant, day, meal, user_id)
               DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = now()""",
            (restaurant, day, meal, user, rating, comment),
        )


async def delete_review(restaurant: int, day, meal: str, user: str) -> bool:
    async with pool.connection() as conn:
        cur = await conn.execute(
            "DELETE FROM review WHERE restaurant = %s AND day = %s AND meal = %s AND user_id = %s",
            (restaurant, day, meal, user),
        )
        return cur.rowcount > 0


async def save_translations(pairs: dict[str, str], lang: str):
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.executemany(
                "INSERT INTO translation (src, lang, dst) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                [(src, lang, dst) for src, dst in pairs.items()],
            )
