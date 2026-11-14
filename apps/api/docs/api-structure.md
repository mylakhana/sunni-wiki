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
| `/books/:slug/chapters?volume&parentId` | TOC without text; top-level chapters unless `parentId`; max limit 500 |
| `/books/:slug/chapters/:chapterSlug` | titles, volume, breadcrumb, prev/next, `tei` |

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
