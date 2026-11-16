# API Project Rules

## Framework & Core
- **Framework:** Fastify (not Express)
- **Language:** TypeScript
- **Database:** MySQL + Prisma ORM
- **Port:** 3001 (API), 3002 (Prisma Studio)

## Architecture
- **Pattern:** Service-Oriented Architecture (SOA)
- Business logic in `services/`
- Route handlers in `routes/v1/`
- One file per route controller
- Validation schemas in `schemas/`

## API Versioning
- All routes under `/v1` prefix
- Use `routes/v1/` directory structure
- Example: `/v1/auth/login`, `/v1/profile/fetch`

## Validation
- Use Zod schemas for all request/response validation
- Use `fastify-type-provider-zod` for type-safe routes
- Define schemas in `schemas/` directory
- Install `fastify-zod-openapi` for Swagger integration
- Add `.describe('field description')` to all schema fields for documentation

## Database
- Prisma as ORM
- Schema in `prisma/schema.prisma`
- Run migrations before code changes
- Never commit raw SQL queries

---

## Error Handling
- Use Fastify error handling
- Return proper HTTP status codes
- Include error messages in responses
- Log errors with Pino

## Logging
- Use Pino logger (built into Fastify)
- Log important events and errors
- Use appropriate log levels

## Documentation
- OpenAPI 3.0 via `@fastify/swagger`
- Swagger UI at `/docs`
- Document all endpoints
- **Swagger + Zod Integration:**
  - Install packages: `fastify-zod-openapi` and `zod-openapi`
  - Register `fastifyZodOpenApiPlugin` before swagger
  - Add transformers to swagger config:
    ```ts
    transform: fastifyZodOpenApiTransform,
    transformObject: fastifyZodOpenApiTransformObject
    ```
  - Use `.describe()` on all Zod schema fields:
    ```ts
    export const schema = z.object({
      email: z.string().email().describe('User email address'),
      age: z.number().describe('User age')
    }).describe('Request body description');
    ```

## Code Organization
```
src/
├── config/         # Environment, Prisma client
├── routes/v1/      # API route handlers (versioned)
├── services/       # Business logic
├── schemas/        # Zod validation schemas
├── middleware/     # Custom middleware
└── index.ts        # App entry point
```

## Best Practices
- Keep routes thin, services thick
- One controller per file in `routes/v1/`
- Use dependency injection
- Separate concerns (routes → services → database)
- Type everything properly

---

## Public library API (v1, read-only)

All routes are `GET`, under `/v1`, and only expose books with `published = true` (404 otherwise).

| Route | Notes |
|---|---|
| `/health` | liveness + DB check |
| `/categories` | all categories by `sort`, `bookCount` (published only) |
| `/authors`, `/authors/:slug` | list is paginated; detail includes `books` |
| `/books?authorSlug&categorySlug` | paginated, newest first (`createdAt desc, id desc`) |
| `/books/:slug` | book + `volumes` (with `chapterCount` and `topLevelCount`) |
| `/books/:slug/chapters?volume&parentId` | TOC without text; top-level chapters unless `parentId`; max limit 500; level 0/1/2 items also carry `markdownChars` (own) and `subtreeChars` (self + descendants), both from `content.markdown_chars` |
| `/books/:slug/chapters/:chapterSlug` | titles, volume, breadcrumb, prev/next, `tei` |
| `/books/:slug/chapters/:chapterSlug/markdown` | `{data:{id,slug,title,breadcrumb,markdown,chars,updatedAt}}`; TEI converted to Markdown on the fly (see format below); `CACHE.chapter` + ETag |
| `/search?q&mode&lang&…` | content search (OpenSearch), see "Content search" below; 503 when the search engine is down |
| `/books/:slug/context-units?node=<id>` | descendant level 1/2 units that own content, reading order, each `{id,slug,title,markdownChars}`, plus `totalChars`; 413 above the cap |

Files: `routes/v1/{categories,authors,books}.ts`, services `library.service.ts` / `chapter.service.ts` / `pagination.ts`, schemas `common.ts` / `library.ts`.

### Conventions
- Lists: `{ data: T[], nextCursor: string | null }`; query `limit` (default 100, max 200) and opaque id-based `cursor`. Single: `{ data: T }`. Dates are ISO strings.
- Errors: `{ statusCode, error, message }`; Zod validation -> 400 with `details: [{path, message}]`; Prisma `P2025` -> 404; 5xx messages are hidden. `@fastify/sensible` provides `app.httpErrors`.
- Plugins (in `app.ts`): HTTP cache hook (`middleware/http-cache.ts`), sensible, helmet, CORS limited to `WEB_ORIGIN` (default `http://localhost:3000`), rate-limit (`RATE_LIMIT_MAX` per minute, default 600), compress (gzip/br, threshold 1 KB).
- HTTP caching: routes declare `config: { cache: CACHE.list | CACHE.detail | CACHE.chapter }`; the hook adds `Cache-Control: public, max-age, s-maxage, stale-while-revalidate`, a weak ETag and answers `If-None-Match` with 304. Lists/details 300 s, chapter text 3600 s.
- prev/next of a chapter: reading order of the book = volumes by `sort` (volume-less last), depth-first walk of the chapter tree (siblings by `sort, id`), keeping only chapters that have content; cached in memory per book for 5 min. A chapter without content has `prev`/`next` null.
- Queries use Prisma `select` only; indexes: `books(published, createdAt)`, `categories(sort)`, `chapters(bookId, volumeId, parentId, sort)`.
- Tests: `pnpm test` (`test/smoke.ts`, Fastify `app.inject` against the real DB).
- `scripts/seed_fatawa_razawiyyah.py` sets `published=1` but its clean step deletes imported chapters; re-run `import_fatawa.py` after it.
- Env `AI_MAX_CONTEXT_TOKENS` (default 200000): cap for Ask-AI context; tokens are estimated as `ceil(chars / 3)`.

### Content search (`GET /v1/search`)
Full-text search inside the books (no AI). Files: `routes/v1/search.ts`, `schemas/search.ts`, `services/search.service.ts` (+ `search-query.ts` pure query builders), `config/search.ts` (OpenSearch REST wrapper). Index/analyzer details: `docs/search-index.md`. Needs OpenSearch (`docker compose up -d opensearch`, env `SEARCH_URL`, `SEARCH_INDEX_PREFIX`); build the index with `pnpm search:reindex`.

| Query param | Notes |
|---|---|
| `q` | required, max 200 chars / 20 words |
| `mode` | `all` (default: every word in the same chapter), `any`, `phrase` (exact phrase) |
| `lang` | `all` (default), `ur`, `ar`, `en` — only search this language's text |
| `bookIds` | comma-separated numeric book ids |
| `volumeId`, `chapterId`, `authorId`, `categoryId` | scope filters (numeric ids) |
| `sort` | `relevance` (default), `canonical` (book, then chapter order), `hits` (most matching passages first; max 1000 results deep) |
| `page`, `pageSize` | 1-based page of **chapters**; `pageSize` 1-50, default 20 |

Response (not wrapped in `{data}`): `{ query, mode, total, page, pageSize, groups, facets }`.
- `total` = matching chapters (all pages). `groups` = this page's chapters grouped by book: `{ book:{id,slug,titleEn/Ar/Ur}, chapterCount, hitCount, chapters:[{ chapterId, slug, titleEn/Ar/Ur, volumeSlug, hitCount, snippets:[{ anchorId, lang, html, quote }] }] }`.
- `snippets` (up to 3 per chapter): `html` is HTML-escaped text with `<mark>…</mark>` around hits and nothing else; `anchorId` is the jump target inside the chapter TEI (link as `/books/<book>/<chapter>#<anchorId>`), null = no anchor. `quote` = `{ q, e: null }`, ~60 chars of text starting at the first matched word. Link as `/books/<book>/<chapter>?q=<q>&b=1`: the reader re-finds that text, scrolls to it and highlights the whole block (paragraph/heading/quote) that contains it (`b=1` clamps the shared-passage highlight to that block; the highlight is re-applied on DOM changes until the reader taps); for long (split) chapters the chapter page picks the part that contains `q` when no `?part` is given.
- `facets`: `books`, `authors`, `categories` — each `[{ id, count }]` (numeric ids, counts of matching chapters).
- Errors: 400 (empty/too long/too many words, page too deep, validation), 429 rate limit (`SEARCH_RATE_LIMIT_MAX`, default 60/min — tighter than the global limit because each request fans out to several OpenSearch queries), 503 when OpenSearch is unreachable or the index is not built. Only active chapters of published books are returned.
- Web side: `apps/web/lib/api/search.ts` maps 400 -> "invalid", anything else -> "unavailable"; never cached.

### Markdown format (`services/tei-markdown.service.ts`)
Pure function, TEI fragment -> compact Markdown. Arabic/Urdu text is kept verbatim.

| TEI | Markdown |
|---|---|
| `<head>` / section titles | `#`..`######` by nesting depth, with the anchor kept as `{#s-...}` |
| question / answer blocks | paragraphs prefixed `Q:` / `A:` |
| `<q>`, `<quote>`, `<cit>` | `> ` blockquote |
| `<note>` footnotes | `[^n]` reference + `[^n]: text` definition at the end |
| page breaks (`<pb>`) | `[p. N]` marker |
| `<hi>`, `<foreign>` and other inline wrappers | flattened to plain text |
| `<p>`, `<l>`/`<lg>` | paragraphs / lines separated by blank lines |
| `<figure>`, `<graphic>`, images, empty anchors, other noise | dropped |

`content.markdown_chars` stores the converted length (backfilled by `scripts/backfill-markdown-chars.ts`).
