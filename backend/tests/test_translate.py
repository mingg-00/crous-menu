import asyncio

import pytest

from app import translate


@pytest.fixture
def fakes(monkeypatch):
    """In-memory stand-ins for the DB cache and the LLM; `llm_calls` records each LLM request."""
    store: dict[tuple[str, str], str] = {}
    llm_calls: list[list[str]] = []

    async def get(texts, lang):
        return {s: store[s, lang] for s in texts if (s, lang) in store}

    async def save(pairs, lang):
        store.update({(s, lang): d for s, d in pairs.items()})

    async def llm(texts, lang):
        llm_calls.append(list(texts))
        await asyncio.sleep(0)  # let concurrent requests interleave, like a real network call
        return {s: f"{s} [{lang}]" for s in texts}

    monkeypatch.setattr(translate, "get_translations", get)
    monkeypatch.setattr(translate, "save_translations", save)
    monkeypatch.setattr(translate, "llm_translate", llm)
    monkeypatch.setattr(translate, "_inflight", set())
    return store, llm_calls


def run(*steps):
    """Run translate_texts calls in one event loop (background tasks need it), letting each one's task finish."""

    async def go():
        results = []
        for texts, lang in steps:
            results.append(await translate.translate_texts(texts, lang))
            await asyncio.gather(*translate._tasks)
        return results

    return asyncio.run(go())


def test_first_request_serves_french_and_translates_in_background(fakes):
    _, llm_calls = fakes
    first, second = run((["Fruit", "Pain bio"], "ko"), (["Fruit", "Pain bio"], "ko"))
    assert first == ({}, True)  # nothing cached yet -> French now, translation pending
    assert second == ({"Fruit": "Fruit [ko]", "Pain bio": "Pain bio [ko]"}, False)
    assert llm_calls == [["Fruit", "Pain bio"]]


def test_concurrent_requests_send_each_text_to_the_llm_once(fakes):
    _, llm_calls = fakes

    async def go():
        await asyncio.gather(*(translate.translate_texts(["Fruit", "Tomates"], "ko") for _ in range(5)))
        await asyncio.gather(*translate._tasks)

    asyncio.run(go())
    assert llm_calls == [["Fruit", "Tomates"]]


def test_only_missing_texts_in_menu_order_and_languages_cached_separately(fakes):
    _, llm_calls = fakes
    run((["Fruit"], "ko"), (["Merlu", "Fait maison", "Fruit", "Fait maison"], "ko"), (["Fruit"], "en"))
    assert llm_calls == [["Fruit"], ["Merlu", "Fait maison"], ["Fruit"]]


def test_llm_failure_caches_nothing_and_next_request_retries(fakes, monkeypatch):
    store, _ = fakes
    calls = []

    async def boom(texts, lang):
        calls.append(texts)
        raise RuntimeError("timeout")

    monkeypatch.setattr(translate, "llm_translate", boom)
    assert run((["Fruit"], "ko"), (["Fruit"], "ko")) == [({}, True), ({}, True)]
    assert store == {} and len(calls) == 2  # in-flight marker was released after the failure


def test_db_down_serves_french_without_calling_llm(fakes, monkeypatch):
    _, llm_calls = fakes

    async def db_down(*a):
        raise ConnectionError("db down")

    monkeypatch.setattr(translate, "get_translations", db_down)
    assert run((["Fruit"], "ko")) == [({}, False)]
    assert llm_calls == []  # would otherwise re-translate (and pay) on every request


def test_cache_write_failure_releases_inflight(fakes, monkeypatch):
    async def db_down(*a):
        raise ConnectionError("db down")

    monkeypatch.setattr(translate, "save_translations", db_down)
    run((["Fruit"], "ko"))
    assert translate._inflight == set()


def test_prewarm_sends_each_menu_as_its_own_batch_once_per_language(fakes, monkeypatch):
    from fastapi import HTTPException

    from app import main

    _, llm_calls = fakes
    near = {"code": 21, "nom": "Resto U", "type": {"code": 1}, "latitude": 44.8065, "longitude": -0.6032}
    far = {**near, "code": 7, "latitude": 43.3, "longitude": -0.37}  # Pau: outside the prewarm radius
    lunch = lambda *lines: {"repas": [{"type": "midi", "categories": [{"libelle": lines[0], "plats": [{"code": 1, "libelle": l} for l in lines[1:]]}]}]}
    menus = {main.menu_path(21, main.today()): lunch("Entrées", "Taboulé", "Ferme"),
             main.menu_path(7, main.today()): lunch("Dessert", "Fruit")}

    async def upstream(path, ttl):
        return [near, far] if path == "/restaurants" else menus.get(path)

    monkeypatch.setattr(main, "upstream", upstream)
    monkeypatch.setattr(main, "PREWARM_TOKEN", "secret")
    with pytest.raises(HTTPException):
        asyncio.run(main.prewarm(days=1, authorization="Bearer wrong"))

    first = asyncio.run(main.prewarm(days=1, authorization="Bearer secret"))
    assert first == {"places": 1, "menus": 1, "lines_sent": 3 * len(translate.LANGUAGES)}
    assert llm_calls == [["Entrées", "Taboulé", "Ferme"]] * len(translate.LANGUAGES)  # whole menu, in order
    assert asyncio.run(main.prewarm(days=1, authorization="Bearer secret"))["lines_sent"] == 0  # all cached now
