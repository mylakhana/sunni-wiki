# SunniWiki — concept (source of truth)

A free, public library of trusted Islamic books, readable in Arabic, Urdu and English.

## Monorepo
- `apps/api` — Fastify + Zod + Prisma (MySQL). See `apps/api/docs/api-structure.md` for routes and conventions.
- `apps/web` — Next.js 16 (App Router, Cache Components). Server-rendered reader.
- `docs/plans/` — work plans and `pending-prototypes.md`.

## Data model (`apps/api/prisma/schema.prisma`)
`Category 1─* Book *─1 Author`; `Book 1─* Volume (optional) 1─* Chapter`; `Book 1─* Chapter` (always set, so volume-less books work); `Chapter` nests via `parentId`; `Chapter 1─* Content` (TEI XML fragment, one row per chapter in practice, slug `default`).
- Only books with `published = true` are exposed by the API.
- `Book.authorId` is **optional** (authors are registered later; migration `20261117000000_book_author_optional`). The API returns `author: null`; the web shows the placeholder "Unknown author" (no link, generic AI persona, citations use the placeholder). Volumes are optional too: volume-less books just have chapters with `volumeId = null`.
- Titles/names are trilingual (`En` required, `Ar`/`Ur` optional). Chapter titles are all optional.
- `Book.languages` is JSON, e.g. `["ar","ur"]`. `Book.coverImage` null → UI gradient cover.
- Text source of truth = TEI XML (`content.tei`). Legacy CSV import: `apps/api/docs/data-import-fatawa-razawiyyah.md`.

## API (`/v1`, GET only)
`/categories`, `/authors`, `/authors/:slug`, `/books`, `/books/:slug`, `/books/:slug/chapters`, `/books/:slug/chapters/:chapterSlug`, plus `/books/:slug/chapters/:chapterSlug/markdown` and `/books/:slug/context-units` for Ask AI. Lists use `{data,nextCursor}` (cursor pagination), singles `{data}`. Public `Cache-Control` + weak ETag, gzip/br compression, rate limiting, CORS limited to `WEB_ORIGIN`. Chapter detail returns TEI plus breadcrumb and prev/next in reading order (volumes by `sort`, then depth-first tree order; chapters without content skipped).

## Web
- Env: `API_URL` (default `http://localhost:3001`), see `apps/web/.env.example`.
- Routes: `/` home, `/browse`, `/authors`, `/authors/[slug]`, `/books/[slug]` (volumes + lazily loaded chapter tree, title filter), `/books/[slug]/[chapter]` (**one chapter per page**; very long chapters are split into `?part=N` pages).
- **Caching:** `cacheComponents: true`. Loaders use `use cache` with `cacheLife` and `cacheTag` (`library`, per-book, per-author). The library (all books, authors, categories) is cached in memory **per web server instance** (~1 h). Failures are never cached for long. Invalidate with `revalidateTag("library")`.
- **Continuous reading** (`components/library/chapter-stream.tsx`, `lib/tei/next-chapter-action.tsx`): at the end of the last chapter on screen the next chapter (skipping groups/empty ones) is appended below; forward only, no prepend. The chapter crossing a band near the top of the viewport is the *current* one: toolbar, contents highlight, Ask-AI contexts, keyboard prev/next and the URL (`history.replaceState`, no history entry per chapter) follow it. Previous/Next buttons stay and are normal jumps. Chapters far from the viewport are unmounted (short ones, height kept) or hidden with `content-visibility` (long ones with lazy parts).
- Reader renders TEI to React (`lib/tei/render.tsx`), no `dangerouslySetInnerHTML`. Reading prefs and "continue reading" live in localStorage (`last:v2`, slugs).
- **Share selection** (`components/library/share-selection.tsx`): selecting chapter text shows a toolbar (floating on laptop, bottom bar on mobile) with Copy (adds citation), Copy link and native Share. The link is `?part&q[&e]#<nearest s-anchor>`; `q` is the selected text (long selections keep only the first/last 40 chars, `q` + `e`). On load the text is re-found (diacritics/whitespace ignored) and highlighted via the CSS Custom Highlight API (`::highlight(shared-quote)`). Share-as-image is not built yet.
- **Author persona prompt:** `Author.prompt` (nullable Text, migration `20261115000100_author_prompt`) holds the AI persona. Seeded from `apps/api/scripts/prompts/<author-slug>.md` by the import seed script. `GET /books/:slug` returns it as `author.prompt` (detail only, not in lists). Ask AI prepends it to the generic grounding rules and shows the result in the "System prompt" panel.
- **Ask AI** (`components/library/ask-ai.tsx`): flow = pick context -> fetch + cache Markdown -> chat.
  - Pick: lazy book tree with real sizes (`markdownChars`/`subtreeChars`). Selectable units are booklets (their intro) and chapters; ticking a parent selects every unit beneath it (via `context-units`). Sub-topics are read-only (part of their chapter). Cap: 200 000 estimated tokens (`ceil(chars/3)`, `AI_MAX_CONTEXT_TOKENS`); Continue is disabled above it.
  - Fetch: each chapter's Markdown (`.../markdown`) is fetched in parallel and cached in **IndexedDB** keyed by `chapterId + contentUpdatedAt` (stale entries refetched; memory fallback if IDB is unavailable).
  - **Context view == AI payload:** the context view renders the cached Markdown through the same assembly function that will build the AI request.
  - State: URL `?ai=1&ctx=<unit ids>` restores the selection on refresh/share (missing/stale Markdown refetched, invalid ids dropped). Chat history lives in `sessionStorage` (cleared with "Clear history").
  - Why not cookies: ~4 KB limit and sent with every request; chapter Markdown can be hundreds of KB.
  - **Chat** (`components/library/ask-ai-chat.tsx`): streams the reply, ChatGPT-style collapsible thinking, GFM Markdown, one-line token usage + % of the context window.
  - **Provider:** by default the server's OpenAI-compatible provider, configured in `apps/api/.env` (`AI_PROVIDER` = deepseek, `AI_MODEL`, `AI_API_KEY`, optional `AI_BASE_URL`, `AI_CONTEXT_TOKENS`). The key never leaves the API: browser -> Next `/api/ai/chat` (stream proxy) -> API `POST /v1/ai/chat` -> provider; `GET /v1/ai/config` reports provider/model/window (no key). Without a key the UI tells the user to use local AI. Reasoning (`reasoning_content`) is shown when the model emits it (e.g. a reasoner model); the Thinking toggle is local-only.
  - **Local override:** the chat's ⋮ menu has "Clear history" and "Use local AI (Ollama)". Local mode talks browser -> `localhost:11434` directly (model name, Thinking toggle, window cap, `OLLAMA_ORIGINS` required); nothing goes through our servers.
  - Still dummy (`TODO(ai)`): the final system prompt text.
- **Decisions:** in-book full-text search is dropped for now (title filter only); no reading-progress percentage (API has no total chapter count).

## Data import (legacy CSV → DB)

Prerequisite: DB migrated (`pnpm prisma migrate deploy`). Run from `apps/api`: `python3 scripts/import_all.py [--book fatawa|bahar|miraat|faizan|siraat] [--skip-seed]` — the single entry point; it re-imports from scratch (each book's old data is cleaned first).

Sequence run by `import_all.py` (stops at the first failure):
1. `pnpm db:seed` (only if the script exists in `package.json`).
2. Per book, in order — **fatawa**: `seed_fatawa_razawiyyah.py` → `python3 -m fatawa.build --all` (in `scripts/`) → `import_fatawa.py --all`; **bahar**: `seed_bahar_e_shariat.py` → `python3 -m bahar.build --all` (in `scripts/`) → `import_bahar.py --all`; **miraat / faizan / siraat** (books 03-05, one generic pipeline, config per book in `scripts/multibook/config.py`): `seed_books.py --book X` → `python3 -m multibook.build --book X --all` (in `scripts/`) → `import_books.py --book X --all`. Details: `apps/api/docs/data-import-multibook.md`; CSV analysis tool: `scripts/analyze_csv.py`.
   - seed = upsert author/category/book, clean that book's chapters/content/volumes, create volumes; build = CSV → TEI JSON in `scripts/out/<book-slug>/`; import = insert chapters + content, then `pnpm backfill:markdown`. Bahar's import marks volumes with no content `inactive` (the API hides inactive volumes/chapters, see `status` on `volumes`/`chapters`).
3. Once, after all books: `chapters_titles_sync.py --mode fix` (splits booklet titles; sets `titleUr = "مقدمہ"` on every chapter with `titleEn = 'Front matter'`). Idempotent.

Adding a book:
1. Analyze its CSVs (columns, TextP codes, TOC↔text page linkage, defects) and note findings in `apps/api/scripts/README.md`.
2. Copy its page images from `data-extracted/<book>/Images` to `apps/web/public/<book-slug>/` (never modify `data-extracted/`).
3. Create `seed_<book>.py` (author, category, book slug, volumes; clean only this book), `<book>/build.py` (package, output to `scripts/out/<book-slug>/`), and `import_<book>.py` (scoped to the book by `books.slug`).
4. Reuse shared code (`fatawa/tei.py`, `fatawa/rtf_decode.py`, DB helpers in `seed_fatawa_razawiyyah.py`) by importing it **unmodified**. If formats differ and changing shared code could alter an earlier book's output, copy and modify instead. Never share `out/` folders (volume slugs repeat across books).
5. Register the book in `BOOKS` in `scripts/import_all.py`; give no-content volumes `inactive` status in the import script.
6. Run `import_all.py` and confirm earlier books' counts/`chapters.json` are unchanged; document the book in `apps/api/docs/data-import-<book>.md`.

## Known gaps
- Page images are hosted from `apps/web/public/<book-slug>/` (e.g. `/fatawa-radawiyya/NAME.jpg`); TEI `graphic` URLs starting with `/` render as images, other relative paths show a placeholder.
- `coverImage` must be a full or site-relative URL.
