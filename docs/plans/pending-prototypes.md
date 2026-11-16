# Pending prototypes

## Pending
| Page / route | Created | Prototype parts |
|---|---|---|
| In-book search (reader) | 2026-11-14 | Content search itself now exists (`/search`, Phase 1, see Completed). Still pending: carrying the query into the reader (highlight every hit, next/previous hit buttons) and scoping the search to the open book/chapter from the reader toolbar — Phase 2, task W4 in `docs/plans/content-search.md`. |
| TEI images in chapters | 2026-11-14 | Done 2026-11-15: images hosted in `apps/web/public/fatawa-radawiyya/`; import writes `/fatawa-radawiyya/NAME` URLs. |
| Ask AI: server-side provider (Anthropic) + final system prompt text (`lib/ai-context.ts`) | 2026-11-15 | Still prototype: system prompt text is a placeholder; no hosted provider yet. The chat itself now runs on the user's local Ollama (see `docs/plans/ask-ai.md`). Token counts use the `ceil(chars/3)` heuristic (real counts shown after each Ollama reply). |

## Completed
| Page / route | Made dynamic | What was wired | Plan |
|---|---|---|---|
| `/` , `/browse`, `/authors`, `/authors/[slug]`, `/books/[slug]`, `/books/[slug]/[chapter]`, command palette | 2026-11-14 | Real API data (books, authors, categories, volumes, chapters, TEI text), per-instance cache, one-chapter reader | `docs/plans/dynamic-web.md` |
| Reader → "Ask AI about this" (context picker, fetch + cache, context view, restore) | 2026-11-15 | Real API: lazy contents tree in selection mode, `context-units` expansion with cap handling, Markdown via `/api/ai/...` proxy, IndexedDB cache with ETag revalidation (`lib/ai-context-cache.ts`), context view rendered from `buildContext`, `?ai=1&ctx=` restore with invalid ids dropped. AI reply/system prompt remain pending (see row above). | `docs/plans/ask-ai.md` |
| `/search` (content search, Phase 1), command-palette "Search inside books for …" row, header link | 2026-11-16 | Real API `GET /v1/search` (all / any / exact-phrase, language toggle, scope by book / writer / topic, sort, grouped results, highlighted snippets, facets, pagination, shareable URL params, unavailable / invalid / empty states). Not wired yet (later phases): proximity / boolean / wildcard syntax, autocomplete, reader hit navigation, history, keyboard, charts. | `docs/plans/content-search.md` |
