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
`/categories`, `/authors`, `/authors/:slug`, `/books`, `/books/:slug`, `/books/:slug/chapters`, `/books/:slug/chapters/:chapterSlug`. Lists use `{data,nextCursor}` (cursor pagination), singles `{data}`. Public `Cache-Control` + weak ETag, gzip/br compression, rate limiting, CORS limited to `WEB_ORIGIN`. Chapter detail returns TEI plus breadcrumb and prev/next in reading order (volumes by `sort`, then depth-first tree order; chapters without content skipped).

## Web
- Env: `API_URL` (default `http://localhost:3001`), see `apps/web/.env.example`.
- Routes: `/` home, `/browse`, `/authors`, `/authors/[slug]`, `/books/[slug]` (volumes + lazily loaded chapter tree, title filter), `/books/[slug]/[chapter]` (**one chapter per page**; very long chapters are split into `?part=N` pages).
- **Caching:** `cacheComponents: true`. Loaders use `use cache` with `cacheLife` and `cacheTag` (`library`, per-book, per-author). The library (all books, authors, categories) is cached in memory **per web server instance** (~1 h). Failures are never cached for long. Invalidate with `revalidateTag("library")`.
- Reader renders TEI to React (`lib/tei/render.tsx`), no `dangerouslySetInnerHTML`. Reading prefs and "continue reading" live in localStorage (`last:v2`, slugs).
- **Share selection** (`components/library/share-selection.tsx`): selecting chapter text shows a toolbar (floating on laptop, bottom bar on mobile) with Copy (adds citation), Copy link and native Share. The link is `?part&q[&e]#<nearest s-anchor>`; `q` is the selected text (long selections keep only the first/last 40 chars, `q` + `e`). On load the text is re-found (diacritics/whitespace ignored) and highlighted via the CSS Custom Highlight API (`::highlight(shared-quote)`). Share-as-image is not built yet.
- **Decisions:** in-book full-text search is dropped for now (title filter only); no reading-progress percentage (API has no total chapter count).

## Known gaps
- Relative TEI image paths (`Images/…`) show a placeholder until images are hosted.
- `coverImage` must be a full or site-relative URL.
