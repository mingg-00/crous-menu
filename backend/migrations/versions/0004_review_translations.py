"""Ratings are stars + comment only: drop emoji reactions. Cache review comments translated into each viewer's
language, deleted with their review (and so with the author's account)."""

from alembic import op

revision = "0004"
down_revision = "0003"


def upgrade():
    op.execute("DROP TABLE reaction")
    op.execute(
        """
        CREATE TABLE review_translation (
            review_id bigint NOT NULL REFERENCES review(id) ON DELETE CASCADE,
            lang      text NOT NULL,
            dst       text NOT NULL,
            PRIMARY KEY (review_id, lang)
        )
        """
    )


def downgrade():
    op.execute("DROP TABLE review_translation")
    op.execute(
        """
        CREATE TABLE reaction (
            restaurant int NOT NULL,
            day        date NOT NULL,
            meal       text NOT NULL,
            voter      uuid NOT NULL,
            kind       text NOT NULL CHECK (kind IN ('yum', 'good', 'meh', 'bad')),
            created_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (restaurant, day, meal, voter)
        )
        """
    )
