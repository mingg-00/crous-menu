"""Initial schema: translation cache, reviews, reports, blocks."""

from alembic import op

revision = "0001"
down_revision = None

# IF NOT EXISTS so databases created before Alembic was added can adopt this revision as-is.
SCHEMA = """
CREATE TABLE IF NOT EXISTS translation (
    src  text NOT NULL,
    lang text NOT NULL,
    dst  text NOT NULL,
    PRIMARY KEY (src, lang)
);

-- One review per user per meal (restaurant + day + meal type), so ratings can't be stuffed.
CREATE TABLE IF NOT EXISTS review (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    restaurant int NOT NULL,
    day        date NOT NULL,
    meal       text NOT NULL,
    user_id    uuid NOT NULL,
    rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    text NOT NULL DEFAULT '' CHECK (length(comment) <= 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (restaurant, day, meal, user_id)
);

-- Edits keep the review id (upsert), so reports survive edits.
CREATE TABLE IF NOT EXISTS report (
    review_id  bigint NOT NULL REFERENCES review(id) ON DELETE CASCADE,
    reporter   uuid NOT NULL,
    reason     text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (review_id, reporter)
);

CREATE TABLE IF NOT EXISTS block (
    blocker    uuid NOT NULL,
    blocked    uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker, blocked)
);
"""


def upgrade():
    op.execute(SCHEMA)


def downgrade():
    op.execute("DROP TABLE block, report, review, translation")
