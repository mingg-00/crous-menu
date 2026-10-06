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
        return {s: f"{s} [{lang}]" for s in texts}

    monkeypatch.setattr(translate, "get_translations", get)
    monkeypatch.setattr(translate, "save_translations", save)
    monkeypatch.setattr(translate, "llm_translate", llm)
    return store, llm_calls


def test_second_request_for_same_texts_does_not_call_llm(fakes):
    _, llm_calls = fakes
    first = asyncio.run(translate.translate_texts({"Fruit", "Pain bio"}, "ko"))
    second = asyncio.run(translate.translate_texts({"Fruit", "Pain bio"}, "ko"))
    assert first == second == {"Fruit": "Fruit [ko]", "Pain bio": "Pain bio [ko]"}
    assert len(llm_calls) == 1


def test_only_missing_texts_go_to_llm_and_languages_are_cached_separately(fakes):
    _, llm_calls = fakes
    asyncio.run(translate.translate_texts({"Fruit"}, "ko"))
    asyncio.run(translate.translate_texts({"Fruit", "Tomates"}, "ko"))
    asyncio.run(translate.translate_texts({"Fruit"}, "en"))
    assert llm_calls == [["Fruit"], ["Tomates"], ["Fruit"]]


def test_llm_failure_returns_nothing_and_caches_nothing(fakes, monkeypatch):
    store, _ = fakes

    async def boom(texts, lang):
        raise RuntimeError("timeout")

    monkeypatch.setattr(translate, "llm_translate", boom)
    assert asyncio.run(translate.translate_texts({"Fruit"}, "ko")) == {}
    assert store == {}
