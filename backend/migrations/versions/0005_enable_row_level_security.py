"""Row-level security on every table: Supabase exposes the public schema over a REST API that the app's public key
can call, so without RLS anyone could read or change reviews, reports and blocks. With RLS on and no policies that
API is denied everything. This server connects as the tables' owner, which bypasses RLS, so it is unaffected."""

from alembic import op

revision = "0005"
down_revision = "0004"


def upgrade():
    op.execute(
        """
        DO $$
        DECLARE t text;
        BEGIN
            FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
                EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            END LOOP;
        END $$
        """
    )


def downgrade():
    pass  # never reopen the tables to the public API
