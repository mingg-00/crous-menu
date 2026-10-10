import os

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.engine import URL

from app.dburl import parse_database_url

# Same DATABASE_URL (and parser) as the app, so both accept the same passwords.
p = parse_database_url(os.environ.get("DATABASE_URL", "postgresql://crous:crous@localhost:5434/crous"))
url = URL.create(
    "postgresql+psycopg", username=p.get("user"), password=p.get("password"),
    host=p.get("host"), port=p.get("port"), database=p.get("dbname"),
)

# Log where we connect (never the password), so a malformed DATABASE_URL is obvious in the deploy log.
print(f"migrating {url.username}@{url.host}:{url.port}/{url.database}")

with create_engine(url).connect() as connection:
    context.configure(connection=connection)
    with context.begin_transaction():
        context.run_migrations()
