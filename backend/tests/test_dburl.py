import pytest

from app.dburl import parse_database_url

HOST = "aws-1-eu-west-3.pooler.supabase.com"


@pytest.mark.parametrize(
    "password",
    ["abc123", "ab@,.", "p@ss@word", "a/b", "a#b", "a?b", "a:b", "[brackets]", "한글비번", "100%"],
)
def test_any_password_keeps_host_user_and_database_intact(password):
    got = parse_database_url(f"postgresql://postgres.ref:{password}@{HOST}:5432/postgres")
    assert got == {"host": HOST, "port": 5432, "user": "postgres.ref", "password": password, "dbname": "postgres"}


def test_percent_escapes_are_decoded_and_scheme_variants_work():
    assert parse_database_url(f"postgres://u:p%40ss@{HOST}/db")["password"] == "p@ss"


def test_whitespace_quotes_query_string_and_missing_parts():
    assert parse_database_url(f'  "postgresql://u:pw@{HOST}:6543/db?sslmode=require" \n') == {
        "host": HOST, "port": 6543, "user": "u", "password": "pw", "dbname": "db"}
    assert parse_database_url(f"postgresql://u@{HOST}") == {"host": HOST, "user": "u"}  # no password/port/db
