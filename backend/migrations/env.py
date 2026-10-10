import os
import re

from alembic import context
from sqlalchemy import create_engine

# Same DATABASE_URL as the app; SQLAlchemy needs the psycopg (v3) driver spelled out.
url = os.environ.get("DATABASE_URL", "postgresql://crous:crous@localhost:5434/crous")
url = re.sub(r"^postgres(ql)?://", "postgresql+psycopg://", url)

with create_engine(url).connect() as connection:
    context.configure(connection=connection)
    with context.begin_transaction():
        context.run_migrations()
