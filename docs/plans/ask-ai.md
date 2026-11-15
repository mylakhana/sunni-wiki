# Plan — "Ask AI about this" (dynamic)

Created: 2026-11-15 · Status: **awaiting confirmation** · Prototype: `apps/web/components/library/ask-ai.tsx` (see `pending-prototypes.md`)

## Goal
Everything real **except** the AI call and the final system prompt:
- selection mode lists the book's real contents (volumes → booklets → chapters) with real sizes;
- an API endpoint converts the stored TEI XML to compact Markdown on the fly;
- the browser fetches and caches that Markdown;
- **the cached Markdown is the single source for both the "context" view and (later) the AI request**, so what the user reads is exactly what the AI gets;
- chat UI, URL state (`?ai=1&ctx=…`), history and the "Clear history" action keep working; the reply and the system prompt stay dummy.

## Assessment
- TEI lives in `content.tei` (avg ≈ 15 KB, max ≈ 1.8 MB per chapter). 5185 chapters, levels: 0 group, 1 booklet (owns its intro TEI), 2 chapter (owns TEI), 3 sub-topic (no content; `anchorId` points inside the parent's TEI).
- Only level 1 and 2 nodes own text → those are the selectable units. A volume/group/booklet can be ticked as a shortcut for everything beneath it.
- API: `GET /v1/books/:slug/chapters` (lazy TOC, cursor) and `/chapters/:chapterSlug` exist; `ChapterService` has the reading order. Web: `loadChapterLevel` server action + `ChapterBrowser` already lazily load the tree.
- TEI parsing today only exists in the web renderer (`apps/web/lib/tei/render.tsx`, fast-xml-parser). The Markdown converter needs the same tag knowledge on the API side.
- Selecting e.g. a whole volume could be tens of MB → needs a hard cap.

## Decisions to confirm
1. **Cache storage = IndexedDB (not cookies).** Cookies hold ~4 KB and are sent on every request; Markdown for a chapter can be 100s of KB. IndexedDB for the Markdown, `sessionStorage` for chat history (already), URL for the selected ids. Cached entries keyed by `chapterId + contentUpdatedAt`; stale ones are refetched.
2. **Selectable units = booklets (their intro) and chapters.** Sub-topics (level 3) are shown in the tree as read-only ("included in chapter") and are not separately selectable in v1, because they have no size of their own. Slicing by anchor can come later.
3. **Hard cap** on a selection: 200 000 estimated tokens (configurable `AI_MAX_CONTEXT_TOKENS`); Continue is disabled with a message above it.
4. **Exact sizes:** add `content.markdown_chars` (int, nullable), backfilled by a script that uses the same converter; the TOC endpoint returns it per node plus subtree totals, so the picker shows exact characters before anything is fetched. Tokens = `ceil(chars / 3)` heuristic (a real token-count call to the AI provider is out of scope until the AI is wired).
5. **Endpoint shape:** `GET /v1/books/:slug/chapters/:chapterSlug/markdown` (per chapter, HTTP-cacheable with ETag, fetched in parallel by the browser so the progress bar is real). A booklet/volume tick expands to its chapter ids client-side via a new `GET /v1/books/:slug/context-units?node=<id>` that lists the descendant units (id, slug, title, markdownChars).

## Database
| # | Task | Status |
|---|------|--------|
| D1 | Migration (`migrate deploy` only): `content.markdown_chars INT NULL` | done |
| D2 | Backfill script `apps/api/scripts` (TS via tsx, uses the API converter) that fills `markdown_chars` for all content rows; idempotent; hooked into the import run order | done |
| D3 | Import pipeline: after importing TEI, call the backfill so new data always has sizes | done |

## API (`apps/api`)
| # | Task | Status |
|---|------|--------|
| A1 | `services/tei-markdown.service.ts`: TEI fragment → compact Markdown (headings, Q/A labels, quotes, `[^n]` footnotes, `[p. N]` page markers, anchors kept as `{#s-…}` in headings for citations, images/noise dropped, Arabic/Urdu kept verbatim, inline `<hi>/<foreign>` flattened). Pure function + unit tests on real samples (incl. the 1.8 MB chapter) | done |
| A2 | `GET /v1/books/:slug/chapters/:chapterSlug/markdown` → `{data:{id,slug,title,breadcrumb,markdown,chars,updatedAt}}`; Zod schema, `.describe()`, ETag/Cache-Control (`CACHE.chapter`), small in-memory LRU of converted output | done |
| A3 | `GET /v1/books/:slug/context-units?node=<id>` → descendant level 1/2 units that own content, in reading order, with `markdownChars` | done |
| A4 | Extend TOC items (`/chapters`) with `markdownChars` (own) and `subtreeChars` for level 0/1/2 nodes; update schemas | done |
| A5 | Enforce the cap server-side too (A3 returns `totalChars`; reject > cap with 413 where units are requested in bulk) | done |

## Web (`apps/web`)
| # | Task | Status |
|---|------|--------|
| W1 | Types/mappers/api client for the new fields and endpoints (`lib/api/*`, `lib/types.ts`) + server actions `loadContextUnits` | done |
| W2 | Replace dummy tree in `AskAiPicker` with the real lazy tree (reuse `loadChapterLevel` and level components from `chapter-browser.tsx`, DRY — add an optional selection mode rather than a second tree); tick parent = tick all units under it; live "N selected · X chars · ~Y tokens"; cap message; topics read-only | done |
| W3 | Context cache module `lib/ai-context-cache.ts` (IndexedDB, versioned keys, `getMany/putMany`, graceful fallback to memory if IDB is unavailable) | done |
| W4 | Continue → fetch all selected Markdown in parallel (limit 4), real progress bar, retry per failed chapter, store in cache, then switch to chat | done |
| W5 | `AskAiContext` renders the cached Markdown (lightweight Markdown renderer, RTL-aware, no `dangerouslySetInnerHTML`) under the system prompt; same string assembly function that will later build the AI request, so view == payload | done |
| W6 | Refresh/shared link: `?ai=1&ctx=<unit ids>` restores from IDB, refetching anything missing/stale; invalid ids dropped | done |
| W7 | Keep dummy: system prompt text, chat reply, provider/model strip (marked `TODO(ai)`) | done |
| W8 | Update `pending-prototypes.md` (move row; leave "AI reply + system prompt" as pending) | done |

## Documentation
| # | Task | Status |
|---|------|--------|
| X1 | `docs/sunniwiki-concept/README.md`: Ask-AI flow, context = cached Markdown, caps, storage choices | done |
| X2 | `apps/api/docs/api-structure.md`: new endpoints and the Markdown format spec (what each TEI element becomes) | done |
| X3 | `apps/api/scripts/README.md`: backfill script and run order | done |
