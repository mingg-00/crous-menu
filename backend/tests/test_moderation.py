import asyncio

from app import moderation


def test_fails_open_when_openai_is_unavailable(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(moderation, "_client", None)
    assert asyncio.run(moderation.is_flagged("anything")) is False


def test_empty_comment_skips_the_check(monkeypatch):
    monkeypatch.setattr(moderation, "_client", object())  # would blow up if used
    assert asyncio.run(moderation.is_flagged("   ")) is False
