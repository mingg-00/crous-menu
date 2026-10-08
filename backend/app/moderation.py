import logging

from openai import AsyncOpenAI

log = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None


async def is_flagged(text: str) -> bool:
    """OpenAI moderation (free, multilingual). Fails open: if the check is down, reports still catch abuse."""
    global _client
    if not text.strip():
        return False
    try:
        _client = _client or AsyncOpenAI(timeout=10, max_retries=1)  # raises if OPENAI_API_KEY is unset
        resp = await _client.moderations.create(model="omni-moderation-latest", input=text)
    except Exception:
        log.exception("moderation check failed, accepting comment")
        return False
    return resp.results[0].flagged
