"""Compare menu-translation configs (prompt x model) on real Crous menus.

    .venv/bin/python -m eval.translation_eval collect   # fetch menus near Talence -> eval/menus.json
    .venv/bin/python -m eval.translation_eval run       # translate with every candidate -> eval/results.json

Each menu is sent as one batch in menu order, like production does on a cold cache.
"""
import asyncio
import json
import math
import random
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from openai import AsyncOpenAI  # noqa: E402

from app import translate  # noqa: E402

HERE = Path(__file__).parent
MENUS, RESULTS = HERE / "menus.json", HERE / "results.json"
UPSTREAM = "https://api.croustillant.menu/v1"
TALENCE = (44.8065, -0.6032)

# The prompt production used before v2, kept verbatim as the baseline.
V1_PROMPT = (
    "You translate French university-canteen menu items into {language}. "
    "Translate the meaning, not the sound: use the everyday name of a food or fish in the target "
    "language instead of transliterating the French word (e.g. merlu = hake), and only keep the "
    "French name for classic dishes with no real equivalent. "
    "'Alternative sans viande' means a meat-free alternative dish (vegetarian option). "
    "Keep them short and natural, as printed on a menu; keep proper and brand names. "
    "The user sends a JSON object mapping ids to French texts. "
    "Reply with a JSON object mapping the same ids to the translations."
)
PROMPTS = {"v1": lambda lang: V1_PROMPT.format(language=translate.LANGUAGES[lang]), "v2": translate.system_prompt}
CANDIDATES = {  # name: (model, prompt)
    "v1-4o-mini": ("gpt-4o-mini", "v1"),  # what is live today
    "v2-4o-mini": ("gpt-4o-mini", "v2"),
    "v2-4.1-mini": ("gpt-4.1-mini", "v2"),
    "v2-5.4-mini": ("gpt-5.4-mini", "v2"),
    "v2-5.5": ("gpt-5.5", "v2"),
}


def km(a, b):
    return math.dist(a, b) * 111  # ponytail: flat-earth approximation, fine for picking nearby restaurants


def collect(n_restaurants=12, max_menus=30, target_texts=300):
    with httpx.Client(base_url=UPSTREAM, timeout=20) as c:
        restos = [
            r
            for r in c.get("/restaurants", params={"region": 1}).json()["data"]
            if r.get("latitude") and (r.get("type") or {}).get("code") in (1, 2)
        ]
        restos.sort(key=lambda r: km(TALENCE, (r["latitude"], r["longitude"])))
        menus = []
        for r in restos[:n_restaurants]:
            res = c.get(f"/restaurants/{r['code']}/menu")
            for day in res.json().get("data", []) if res.is_success else []:
                for meal in day["repas"]:
                    texts = [t for cat in meal["categories"] for t in (cat["libelle"], *(p["libelle"] for p in cat["plats"]))]
                    if texts:
                        menus.append({"restaurant": r["nom"], "date": day["date"], "meal": meal["type"], "texts": texts})
    # Greedy pick of menus that add the most unseen lines, so the sample covers many different dishes.
    random.seed(0)
    random.shuffle(menus)
    picked, seen = [], set()
    while menus and len(picked) < max_menus and len(seen) < target_texts:
        best = max(menus, key=lambda m: len(set(m["texts"]) - seen))
        menus.remove(best)
        picked.append(best)
        seen |= set(best["texts"])
    MENUS.write_text(json.dumps(picked, ensure_ascii=False, indent=1))
    print(f"{len(picked)} menus, {len(seen)} unique lines -> {MENUS}")


async def run(only=None):
    menus = json.loads(MENUS.read_text())
    results = json.loads(RESULTS.read_text()) if RESULTS.exists() else {}
    translate._client = AsyncOpenAI(timeout=180, max_retries=2)
    sem = asyncio.Semaphore(6)
    original_prompt = translate.system_prompt
    for name, (model, prompt) in CANDIDATES.items():
        if only and name not in only:
            continue
        # Prompt is swapped per phase (not per call), so concurrent calls within a phase all see the same one.
        translate.system_prompt = PROMPTS[prompt]
        out = {"en": {}, "ko": {}}
        failures, started = 0, time.time()

        async def one(menu, lang):
            nonlocal failures
            async with sem:
                try:
                    got = await translate.llm_translate(menu["texts"], lang, model=model)
                except Exception as e:
                    failures += 1
                    print(f"  {name} {lang} failed: {e!r}"[:200])
                    return
                for src, dst in got.items():
                    out[lang].setdefault(src, dst)

        await asyncio.gather(*(one(m, lang) for m in menus for lang in ("en", "ko")))
        results[name] = out
        n_src = len({t for m in menus for t in m["texts"]})
        print(f"{name}: {time.time() - started:.0f}s, failed calls {failures}, "
              f"coverage en {len(out['en'])}/{n_src} ko {len(out['ko'])}/{n_src}")
    translate.system_prompt = original_prompt
    RESULTS.write_text(json.dumps(results, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    {"collect": lambda: collect(), "run": lambda: asyncio.run(run(sys.argv[2:] or None))}[sys.argv[1]]()
