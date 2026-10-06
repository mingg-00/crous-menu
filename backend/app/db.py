import os

from psycopg_pool import AsyncConnectionPool

pool = AsyncConnectionPool(
    os.environ.get("DATABASE_URL", "postgresql://crous:crous@localhost:5434/crous"), open=False
)

# ponytail: schema created inline; switch to Alembic once there is more than one table to evolve.
SCHEMA = """
CREATE TABLE IF NOT EXISTS translation (
    src  text NOT NULL,
    lang text NOT NULL,
    dst  text NOT NULL,
    PRIMARY KEY (src, lang)
)
"""


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


async def save_translations(pairs: dict[str, str], lang: str):
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.executemany(
                "INSERT INTO translation (src, lang, dst) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                [(src, lang, dst) for src, dst in pairs.items()],
            )
