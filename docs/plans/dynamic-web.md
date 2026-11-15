# Plan — Make `apps/web` dynamic (real API + DB)

Created: 2026-11-14 · Status: **implemented; pending verification against the live API**

## Goal
Replace the mock `apps/web/lib/data.ts` with real data from `apps/api` (MySQL via Prisma).
- Homepage (and the other library pages) load **all books, authors and categories** and cache them **per server instance**.
- The reader loads **one chapter at a time** (chapter text = TEI XML from `content.tei`).
- API endpoints follow best practices (validation, pagination, HTTP caching, compression, errors, rate limiting, OpenAPI docs).

## Assessment (what exists today)
- DB: 1 book (Fatawa Radawiyyah, `published = false`), 1 author, 1 category, 31 volumes, 5185 chapters (4970 nested via `parentId`), 4848 content rows. TEI avg ≈ 15 KB, max ≈ 1.8 MB per chapter.
- API: Fastify + Zod + OpenAPI, only `GET /v1/health`. Generated Prisma client was stale (regenerated, `pnpm db:generate`).
- Web: Next 16.4.5 (read `node_modules/next/dist/docs/` first), 14 files import mock `@/lib/data`: `app/page.tsx`, `app/authors/*`, `app/books/[id]`, `reader.tsx`, `browse-view`, `command-palette`, `book-card`, `book-cover`, `book-progress`, `continue-reading`, `related-books`, `author-avatar`, `block.tsx`. Mock ids are slugs; DB has `slug` on book/author/category/volume/chapter.
- Gaps between mock UI and DB (need decisions in code): author `color`/`bio`, book `hue`/`blurb`/`added`/`volumes` count → derive (hash of slug for colours, `createdAt` for "added", `_count` for volumes, `description`/`bio` nullable → hide when null). Chapter titles are nullable per language.
- Concept docs: `docs/sunniwiki-concept/` and `docs/plans/pending-prototypes.md` **do not exist yet** (CLAUDE.md refers to them). Documentation tasks below create them.

## Decisions to confirm (see end of chat message)
1. Set Fatawa Radawiyyah `published = true` (API only returns published books).
2. Caching = Next.js `use cache` + `cacheLife` (in-memory per web instance), enabling `cacheComponents: true`.
3. In-book full-text search is dropped for now (it relied on all mock text being in the browser); chapter-title filter only.

## Database
| # | Task | Status |
|---|------|--------|
| D1 | Regenerate Prisma client (`pnpm db:generate`) | done |
| D2 | Migration: indexes for list queries — `books(published, createdAt)`; verify `chapters` sibling ordering index covers TOC query | done |
| D3 | Set `books.published = true` for Fatawa Radawiyyah in `scripts/seed_fatawa_razawiyyah.py` (keeps import idempotent) and run it | done |

## API (`apps/api`, all under `/v1`, one route file per controller, thin routes / fat services)
| # | Task | Status |
|---|------|--------|
| A1 | Plugins: `@fastify/sensible` (httpErrors), `@fastify/compress` (TEI up to 1.8 MB), `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/etag`-style weak ETag + `Cache-Control` helper; CORS restricted to `WEB_ORIGIN` env | done |
| A2 | Error handler: map Zod validation errors → 400 with field details, Prisma `P2025` → 404, consistent `{statusCode,error,message}`; request-id in logs | done |
| A3 | Shared schemas: pagination (`limit`, `cursor`), list envelope `{data, nextCursor}`, slug param, error schema; every field `.describe()`d | done |
| A4 | `GET /v1/categories` — all categories ordered by `sort`, with published book count | done |
| A5 | `GET /v1/authors` and `GET /v1/authors/:slug` — author + published book count; detail includes its books | done |
| A6 | `GET /v1/books` — published books, filters `authorSlug`, `categorySlug`, `limit` (default 100, max 200) + cursor; `select` only needed fields (author/category summary, volume count, languages, coverImage, createdAt) | done |
| A7 | `GET /v1/books/:slug` — book detail + ordered volumes (`sort`) | done |
| A8 | `GET /v1/books/:slug/chapters?volume=<slug>&parent=<id>` — table of contents, **no content**, paginated, ordered by `sort`; includes `hasChildren` | done |
| A9 | `GET /v1/books/:slug/chapters/:chapterSlug` — one chapter: titles, volume, breadcrumb (ancestors), `prev`/`next` chapter links, and `content.tei` (default content row) | done |
| A10 | HTTP caching: `Cache-Control: public, max-age/s-maxage` + ETag on all GETs (shorter on lists, longer on chapter text); 304 support | done |
| A11 | OpenAPI tags/summaries/examples for all new routes; `GET /v1/health` kept | done |
| A12 | Smoke tests with `app.inject` for each route (200, 404, bad params, pagination, 304) | done |

## Web (`apps/web`)
| # | Task | Status |
|---|------|--------|
| W1 | Read Next docs (`cacheComponents`, `use cache`, `cacheLife`, `cacheTag`, `fetching-data`); add `API_URL` env + `.env.example`; enable `cacheComponents` in `next.config.ts` and fix pages that need `<Suspense>` | done |
| W2 | `lib/api/` typed client (server-only) + mappers from API DTOs to the existing UI types; remove mock data, keep `initials`/colour helpers | done |
| W3 | Cached loaders: `getLibrary()` (books + authors + categories, `use cache`, `cacheLife` ≈ 1 h, `cacheTag("library")`) used by home, browse, authors, author detail, related books, command palette | done |
| W4 | Homepage: wire featured / recently added / by-writer / topics to `getLibrary()`; empty/error states | done |
| W5 | Browse, Authors, Author detail, command palette, book cards/covers: switch to real data (slugs as ids; fallback gradient cover) | done |
| W6 | Book page `/books/[slug]`: volumes + chapter list from API (loaded per volume, lazily), `generateStaticParams` from cached library | done |
| W7 | Reader: load **one chapter at a time** (`/books/[slug]/[chapter]` route, prev/next from API, URL = source of truth); remove all-content client search | done |
| W8 | TEI → React renderer (`<head>`, `<p xml:lang>`, `<quote type=quran>`, `<note type=footnote>`, `<ab type=question|answer>`, `<hi>`, `<table>`, `<figure>`, `<pb>`; `<index>` ignored) replacing the mock `Block` type; sanitise, no `dangerouslySetInnerHTML` | done |
| W9 | Continue-reading + book-progress: store slugs (`book`, `chapter`) instead of mock ids; handle missing data | done |
| W10 | `loading.tsx` / `error.tsx` / `not-found` for dynamic routes; typecheck + lint + build pass | done |

## Documentation
| # | Task | Status |
|---|------|--------|
| X1 | Create `docs/sunniwiki-concept/` (overview, data model, API reference, web architecture & caching) | done |
| X2 | Update `apps/api/docs/api-structure.md` with the new routes/plugins/conventions | done |
| X3 | Create `docs/plans/pending-prototypes.md`; record the pages made dynamic (Completed) and any still-prototype parts (e.g. in-book search) | done |
| X4 | Keep this plan's task statuses up to date | done |

## Execution order (after confirmation)
Phase 1 (parallel): **Database** + **API** (A1–A12) + **Web W1**.
Phase 2 (parallel): **Web W2–W10** (needs API contract) + **Documentation**.
