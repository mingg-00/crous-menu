import os

# Must run before `app` is imported: db.pool and auth.ISSUER read these at import time.
# Review tests need the test database once: docker compose exec db createdb -U crous crous_test
os.environ["DATABASE_URL"] = "postgresql://crous:crous@localhost:5434/crous_test"
os.environ["SUPABASE_URL"] = "https://test-project.supabase.co"
