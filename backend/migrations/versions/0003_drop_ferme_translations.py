"""Drop cached translations of "Ferme" (= Fermé, stand closed) made as "farm"; they are retranslated on next request."""

from alembic import op

revision = "0003"
down_revision = "0002"


def upgrade():
    op.execute("DELETE FROM translation WHERE lower(src) IN ('ferme', 'fermé', 'fermée')")


def downgrade():
    pass
