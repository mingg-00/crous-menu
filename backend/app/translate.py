import json
import logging
import os

from openai import AsyncOpenAI

from app.db import get_translations, save_translations

log = logging.getLogger(__name__)

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
LANGUAGES = {"en": "English", "ko": "Korean"}  # "fr" is the source language, never translated

_client: AsyncOpenAI | None = None


async def llm_translate(texts: list[str], lang: str) -> dict[str, str]:
    """Translate French menu texts in one call. Returns only the entries the model answered validly."""
    global _client
    # Short timeout: a menu request must not hang on the LLM; callers fall back to French.
    _client = _client or AsyncOpenAI(timeout=15, max_retries=1)
    resp = await _client.chat.completions.create(
        model=MODEL,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    f"You translate French university-canteen menu items into {LANGUAGES[lang]}. "
                    "Translate the meaning, not the sound: use the everyday name of a food or fish in the target "
                    "language instead of transliterating the French word (e.g. merlu = hake), and only keep the "
                    "French name for classic dishes with no real equivalent. "
                    "'Alternative sans viande' means a meat-free alternative dish (vegetarian option). "
                    "Keep them short and natural, as printed on a menu; keep proper and brand names. "
                    "The user sends a JSON object mapping ids to French texts. "
                    "Reply with a JSON object mapping the same ids to the translations."
                ),
            },
            {"role": "user", "content": json.dumps(dict(enumerate(texts)), ensure_ascii=False)},
        ],
    )
    out = json.loads(resp.choices[0].message.content)
    return {
        texts[int(i)]: dst
        for i, dst in out.items()
        if i.isdigit() and int(i) < len(texts) and isinstance(dst, str) and dst.strip()
    }


async def translate_texts(texts: set[str], lang: str) -> dict[str, str]:
    """Translations for `texts`: cached ones from the DB, the rest from the LLM (then cached).
    Texts that could not be translated are simply absent from the result."""
    try:
        found = await get_translations(texts, lang)
    except Exception:
        # Without the cache every request would hit the LLM, so serve French instead.
        log.exception("translation cache unavailable, serving French")
        return {}
    missing = sorted(texts - found.keys())
    if missing:
        try:
            new = await llm_translate(missing, lang)
        except Exception:
            log.exception("LLM translation failed, serving French")
            new = {}
        if new:
            try:
                await save_translations(new, lang)
            except Exception:
                log.exception("could not cache translations")  # still return them for this request
            found |= new
    return found
