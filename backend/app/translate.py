import asyncio
import json
import logging
import os

from openai import AsyncOpenAI

from app.db import get_translations, save_translations

log = logging.getLogger(__name__)

# Chosen with eval/translation_eval.py (see eval/REPORT.md): best quality; low effort cuts cost ~3x at equal quality.
MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.5")
REASONING_EFFORT = os.environ.get("OPENAI_REASONING_EFFORT", "low")
# "fr" is the source language, never translated. The rest: where this semester's Talence exchange students come from.
LANGUAGES = {
    "en": "English",
    "de": "German",
    "es": "Spanish",
    "ko": "Korean",
    "nl": "Dutch",
    "it": "Italian",
    "ja": "Japanese",
    "sv": "Swedish",
    "zh-Hant": "Traditional Chinese (Taiwan)",
    "et": "Estonian",
    "pt": "Brazilian Portuguese",
    "da": "Danish",
    "pl": "Polish",
    "sk": "Slovak",
    "tr": "Turkish",
}

_client: AsyncOpenAI | None = None
_inflight: set[tuple[str, str]] = set()  # (text, lang) being translated right now
_tasks: set[asyncio.Task] = set()  # strong refs so background tasks aren't garbage-collected


# Per-language style notes; the shared rules are in system_prompt().
STYLE = {
    "en": "Use British/US-neutral menu English. For a French dish with no common English name, keep the French "
    "name and add a short gloss in parentheses, e.g. \"Parmentier (mashed-potato bake)\".",
    "ja": "Use natural Japanese menu style: short noun phrases. For a French dish with no common Japanese name, write "
    "it in katakana and add a short gloss in parentheses, e.g. \"パルマンティエ（マッシュポテトのグラタン）\".",
    "zh-Hant": "Use Traditional Chinese characters and Taiwanese food vocabulary (e.g. 馬鈴薯, not 土豆). For a French "
    "dish with no common Chinese name, keep the French name and add a short gloss in parentheses.",
    "ko": "Use natural Korean menu style: short noun phrases, no sentence endings (except greetings such as "
    "\"Bon appétit\" → \"맛있게 드세요\"). For a French dish with no common Korean name, write it in Hangul and add a "
    "short gloss in parentheses, e.g. \"파르망티에(으깬 감자 그라탱)\". Use standard spelling (간 당근, not 갈은 당근).",
}
DEFAULT_STYLE = (
    "Use the short noun-phrase style of a menu in that language. For a French dish with no common local name, keep "
    "the French name and add a short gloss in parentheses."
)


def system_prompt(lang: str) -> str:
    return (
        f"You translate menu lines from French university restaurants (Crous) into {LANGUAGES[lang]} for "
        "international students who don't read French.\n"
        "Input: a JSON object mapping ids to lines, in the order they appear on the menu, so neighbouring lines "
        "give context. A line can be a dish, a side, a section header (\"Entrées\", \"Plat du jour - stand 2\"), "
        "a label (\"Alternative sans viande :\", \"Fait maison\", \"Bio\") or a message (\"Bon appétit\").\n"
        "Rules:\n"
        "- Translate the meaning, not the sound: use the everyday name of a food, fish or cheese the reader knows "
        "(merlu = hake, carottes râpées = grated carrots).\n"
        "- Labels stay labels: keep them short and keep trailing punctuation such as ':'. "
        "\"Alternative sans viande\" = meat-free alternative, \"Fait maison\" = homemade, \"Bio\" = organic.\n"
        "- A line that is only \"Ferme\", \"Fermé\" or \"Fermée\" (accents are often dropped) means the stand is "
        "closed, never \"farm\".\n"
        "- Don't add or drop information; keep brand and place names.\n"
        f"- {STYLE.get(lang, DEFAULT_STYLE)}\n"
        "Reply with a JSON object mapping the same ids to the translations."
    )


async def llm_translate(texts: list[str], lang: str, model: str = MODEL) -> dict[str, str]:
    """Translate French menu texts in one call. Returns only the entries the model answered validly."""
    global _client
    # Runs in the background (see translate_texts), so no user waits on this timeout.
    _client = _client or AsyncOpenAI(timeout=120, max_retries=1)
    resp = await _client.chat.completions.create(
        model=model,
        # GPT-5-family reasoning models only accept the default temperature.
        **({"reasoning_effort": REASONING_EFFORT} if model.startswith("gpt-5") else {"temperature": 0}),
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt(lang)},
            {"role": "user", "content": json.dumps(dict(enumerate(texts)), ensure_ascii=False)},
        ],
    )
    out = json.loads(resp.choices[0].message.content)
    return {
        texts[int(i)]: dst
        for i, dst in out.items()
        if i.isdigit() and int(i) < len(texts) and isinstance(dst, str) and dst.strip()
    }


async def _translate_and_cache(texts: list[str], lang: str):
    try:
        new = await llm_translate(texts, lang)
        if new:
            await save_translations(new, lang)
    except Exception:
        log.exception("background translation failed; the next request will retry")
    finally:
        _inflight.difference_update((t, lang) for t in texts)


async def translate_texts(texts: list[str], lang: str) -> tuple[dict[str, str], bool]:
    """Cached translations for `texts` (menu order, duplicates allowed), plus whether some are still pending.

    Missing texts are translated in a background task (the LLM takes ~10s), so callers get French for those
    now and the translation on a later request. Each text is sent to the LLM once even under concurrent requests.
    """
    texts = list(dict.fromkeys(texts))
    try:
        found = await get_translations(set(texts), lang)
    except Exception:
        # Without the cache every request would hit the LLM, so serve French instead.
        log.exception("translation cache unavailable, serving French")
        return {}, False
    missing = [t for t in texts if t not in found]
    todo = [t for t in missing if (t, lang) not in _inflight]  # keep menu order: it gives the LLM context
    if todo:
        _inflight.update((t, lang) for t in todo)
        task = asyncio.create_task(_translate_and_cache(todo, lang))
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
    return found, bool(missing)
