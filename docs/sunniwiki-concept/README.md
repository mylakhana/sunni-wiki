# SunniWiki — concept (source of truth)

A free, public library of trusted Islamic books, readable in Arabic, Urdu and English.

## Monorepo
- `apps/api` — Fastify + Zod + Prisma (MySQL). See `apps/api/docs/api-structure.md` for routes and conventions.
- `apps/web` — Next.js 16 (App Router, Cache Components). Server-rendered reader.
- `docs/plans/` — work plans and `pending-prototypes.md`.

## Data model (`apps/api/prisma/schema.prisma`)
`Category 1─* Book *─1 Author`; `Book 1─* Volume (optional) 1─* Chapter`; `Book 1─* Chapter` (always set, so volume-less books work); `Chapter` nests via `parentId`; `Chapter 1─* Content` (TEI XML fragment, one row per chapter in practice, slug `default`).
- Only books with `published = true` are exposed by the API.
- Titles/names are trilingual (`En` required, `Ar`/`Ur` optional). Chapter titles are all optional.
- `Book.languages` is JSON, e.g. `["ar","ur"]`. `Book.coverImage` null → UI gradient cover.
- Text source of truth = TEI XML (`content.tei`). Legacy CSV import: `apps/api/docs/data-import-fatawa-razawiyyah.md`.

## API (`/v1`, GET only)
`/categories`, `/authors`, `/authors/:slug`, `/books`, `/books/:slug`, `/books/:slug/chapters`, `/books/:slug/chapters/:chapterSlug`, plus `/books/:slug/chapters/:chapterSlug/markdown` and `/books/:slug/context-units` for Ask AI. Lists use `{data,nextCursor}` (cursor pagination), singles `{data}`. Public `Cache-Control` + weak ETag, gzip/br compression, rate limiting, CORS limited to `WEB_ORIGIN`. Chapter detail returns TEI plus breadcrumb and prev/next in reading order (volumes by `sort`, then depth-first tree order; chapters without content skipped).

## Web
- Env: `API_URL` (default `http://localhost:3001`), see `apps/web/.env.example`.
- Routes: `/` home, `/browse`, `/authors`, `/authors/[slug]`, `/books/[slug]` (volumes + lazily loaded chapter tree, title filter), `/books/[slug]/[chapter]` (**one chapter per page**; very long chapters are split into `?part=N` pages).
- **Caching:** `cacheComponents: true`. Loaders use `use cache` with `cacheLife` and `cacheTag` (`library`, per-book, per-author). The library (all books, authors, categories) is cached in memory **per web server instance** (~1 h). Failures are never cached for long. Invalidate with `revalidateTag("library")`.
- Reader renders TEI to React (`lib/tei/render.tsx`), no `dangerouslySetInnerHTML`. Reading prefs and "continue reading" live in localStorage (`last:v2`, slugs).
- **Share selection** (`components/library/share-selection.tsx`): selecting chapter text shows a toolbar (floating on laptop, bottom bar on mobile) with Copy (adds citation), Copy link and native Share. The link is `?part&q[&e]#<nearest s-anchor>`; `q` is the selected text (long selections keep only the first/last 40 chars, `q` + `e`). On load the text is re-found (diacritics/whitespace ignored) and highlighted via the CSS Custom Highlight API (`::highlight(shared-quote)`). Share-as-image is not built yet.
- **Author persona prompt:** `Author.prompt` (nullable Text, migration `20261115000100_author_prompt`) holds the AI persona. Seeded from `apps/api/scripts/prompts/<author-slug>.md` by the import seed script. `GET /books/:slug` returns it as `author.prompt` (detail only, not in lists). Ask AI prepends it to the generic grounding rules and shows the result in the "System prompt" panel.
- **Ask AI** (`components/library/ask-ai.tsx`): flow = pick context -> fetch + cache Markdown -> chat.
  - Pick: lazy book tree with real sizes (`markdownChars`/`subtreeChars`). Selectable units are booklets (their intro) and chapters; ticking a parent selects every unit beneath it (via `context-units`). Sub-topics are read-only (part of their chapter). Cap: 200 000 estimated tokens (`ceil(chars/3)`, `AI_MAX_CONTEXT_TOKENS`); Continue is disabled above it.
  - Fetch: each chapter's Markdown (`.../markdown`) is fetched in parallel and cached in **IndexedDB** keyed by `chapterId + contentUpdatedAt` (stale entries refetched; memory fallback if IDB is unavailable).
  - **Context view == AI payload:** the context view renders the cached Markdown through the same assembly function that will build the AI request.
  - State: URL `?ai=1&ctx=<unit ids>` restores the selection on refresh/share (missing/stale Markdown refetched, invalid ids dropped). Chat history lives in `sessionStorage` (cleared with "Clear history").
  - Why not cookies: ~4 KB limit and sent with every request; chapter Markdown can be hundreds of KB.
  - Still dummy (`TODO(ai)`): the AI call/reply, the system prompt and the provider/model strip.
- **Decisions:** in-book full-text search is dropped for now (title filter only); no reading-progress percentage (API has no total chapter count).

## Known gaps
- Page images are hosted from `apps/web/public/<book-slug>/` (e.g. `/fatawa-razawiyya/NAME.jpg`); TEI `graphic` URLs starting with `/` render as images, other relative paths show a placeholder.
- `coverImage` must be a full or site-relative URL.
