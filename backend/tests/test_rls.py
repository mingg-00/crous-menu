import psycopg

from tests.conftest import TEST_DB


def test_every_table_has_row_level_security(client):
    """Supabase's public REST API reaches any table without RLS using the app's public key. A new table added by a
    later migration must enable RLS too (ALTER TABLE ... ENABLE ROW LEVEL SECURITY), or this fails."""
    with psycopg.connect(TEST_DB) as conn:
        open_tables = conn.execute(
            "SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity"
        ).fetchall()
    assert open_tables == []
