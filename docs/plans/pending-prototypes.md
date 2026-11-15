# Pending prototypes

## Pending
| Page / route | Created | Prototype parts |
|---|---|---|
| In-book search (reader) | 2026-11-14 | Full-text search was removed; only a chapter-title filter exists. Real search needs a server-side index (derived from TEI). |
| TEI images in chapters | 2026-11-14 | Done 2026-11-15: images hosted in `apps/web/public/fatawa-razawiyya/`; import writes `/fatawa-razawiyya/NAME` URLs. |
| Ask AI: AI reply + real system prompt + real token counting (`components/library/ask-ai.tsx`, `lib/ai-context.ts`) | 2026-11-15 | Still prototype (marked `TODO(ai)`): system prompt text, canned chat reply (no AI call), provider/model/thinking strip. Token counts use the `ceil(chars/3)` heuristic, not a provider count. |

## Completed
| Page / route | Made dynamic | What was wired | Plan |
|---|---|---|---|
| `/` , `/browse`, `/authors`, `/authors/[slug]`, `/books/[slug]`, `/books/[slug]/[chapter]`, command palette | 2026-11-14 | Real API data (books, authors, categories, volumes, chapters, TEI text), per-instance cache, one-chapter reader | `docs/plans/dynamic-web.md` |
| Reader → "Ask AI about this" (context picker, fetch + cache, context view, restore) | 2026-11-15 | Real API: lazy contents tree in selection mode, `context-units` expansion with cap handling, Markdown via `/api/ai/...` proxy, IndexedDB cache with ETag revalidation (`lib/ai-context-cache.ts`), context view rendered from `buildContext`, `?ai=1&ctx=` restore with invalid ids dropped. AI reply/system prompt remain pending (see row above). | `docs/plans/ask-ai.md` |
