import os
import re

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

# Same DATABASE_URL as the app; SQLAlchemy needs the psycopg (v3) driver spelled out.
url = os.environ.get("DATABASE_URL", "postgresql://crous:crous@localhost:5434/crous")
url = re.sub(r"^postgres(ql)?://", "postgresql+psycopg://", url)

# Log where we connect (never the password), so a malformed DATABASE_URL is obvious in the deploy log.
_u = make_url(url)
print(f"migrating {_u.username}@{_u.host}:{_u.port}/{_u.database}")

with create_engine(url).connect() as connection:
    context.configure(connection=connection)
    with context.begin_transaction():
        context.run_migrations()
