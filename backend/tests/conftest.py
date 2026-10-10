import os

import psycopg
import pytest

# Must run before `app` is imported: db.pool and auth.ISSUER read these at import time.
# DB tests need the test database once: docker compose exec db createdb -U crous crous_test
TEST_DB = "postgresql://crous:crous@localhost:5434/crous_test"
os.environ["DATABASE_URL"] = TEST_DB
os.environ["SUPABASE_URL"] = "https://test-project.supabase.co"


@pytest.fixture(scope="session")
def client():
    """App client on an empty test DB built by the migrations. Session-wide: the pool can't reopen once closed."""
    from alembic import command
    from alembic.config import Config
    from fastapi.testclient import TestClient

    from app import main

    try:
        with psycopg.connect(TEST_DB, autocommit=True, connect_timeout=2) as conn:
            conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public")  # start empty: proves migrations build it
    except psycopg.OperationalError:
        pytest.skip("test Postgres not running (docker compose up -d db)")
    command.upgrade(Config("alembic.ini"), "head")
    with TestClient(main.app) as c:
        yield c
