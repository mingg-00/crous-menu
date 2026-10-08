# Menu translation eval (2026-10-08)

**Data:** 30 real menus (264 unique lines) from 9 Crous restaurants around Talence/Pessac, collected with
`python -m eval.translation_eval collect` → `menus.json`. Each menu is translated as one batch in menu order,
as production does on a cold cache. Outputs for every candidate: `results.json`.

**Candidates:** prompt v1 (the original) vs v2 (`app.translate.system_prompt`: menu-order context, label rules,
"meaning not sound", per-language style) × gpt-4o-mini, gpt-4.1-mini, gpt-5.4-mini, gpt-5.5.

## Findings (judged line by line, en + ko)

| Candidate | Verdict | Typical errors |
|---|---|---|
| v1 + gpt-4o-mini (was live) | ✗ | `Cuisse de poulet (vf - bbc)` → ko "닭다리 (비건 - 바비큐)": a meat dish labelled **vegan**; drops origin labels (vf, msc); "갈은 당근"; `Bar` → "Bass"/"농어" |
| v2 + gpt-4o-mini | ✗ | prompt fixes spelling and "Alternative sans viande", label/dish errors remain |
| v2 + gpt-4.1-mini | ~ | `(vf - bbc)` → en "(local farm - organic)" (Bleu-Blanc-Cœur isn't organic); merlu → 명태 (pollock) |
| v2 + gpt-5.4-mini | ~ | `(veggie)` → "비건"; pleurotes → 표고버섯 (shiitake); "파일럿 라이스"; no glosses |
| **v2 + gpt-5.5** | **✓** | decodes vf/vpf/vbf (French meat/pork/beef), MSC, Bleu-Blanc-Cœur; glosses unfamiliar dishes ("악소아(바스크식 채소 스튜)"); idiomatic labels ("배식대 1: 일반식") |

Mislabelled diet/origin info is the failure that matters most (vegetarian students rely on it), so the cheaper
models were ruled out on that alone.

## Cost and latency (4 Korean menus, 90 lines; prices from third-party listings, $/1M in/out)

| Config | avg / max latency | $ per 1000 lines | labels decoded |
|---|---|---|---|
| gpt-5.5, default effort | 13.8s / 18.4s | 1.51 | ✓ |
| **gpt-5.5, effort=low** | **8.1s / 12.1s** | **0.51** | **✓** |
| gpt-5.4, default | 6.2s / 6.7s | 0.26 | ✗ (kept "(VPF)") |
| gpt-5.4, effort=low | 9.8s / 13.2s | 0.35 | ✗ |

**Decision:** gpt-5.5 with `reasoning_effort=low`. Same quality as default effort at a third of the cost.
Because ~10s is too slow to block a request, translation runs in a background task: the first viewer gets French
plus `translating: true` and the app re-fetches; each line is translated once and cached per language.
