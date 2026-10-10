"""Emoji reactions to a meal, one per anonymous device per restaurant/day/meal."""

from alembic import op

revision = "0002"
down_revision = "0001"


def upgrade():
    op.execute(
        """
        CREATE TABLE reaction (
            restaurant int NOT NULL,
            day        date NOT NULL,
            meal       text NOT NULL,
            voter      uuid NOT NULL, -- random per-device id from the app, not linked to any account
            kind       text NOT NULL CHECK (kind IN ('yum', 'good', 'meh', 'bad')),
            created_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (restaurant, day, meal, voter)
        )
        """
    )


def downgrade():
    op.execute("DROP TABLE reaction")
