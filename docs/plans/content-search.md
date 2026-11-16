# Plan — Content search (full-text, no AI)

Status: **awaiting user confirmation** (nothing is implemented yet).
Created: 2026-11-16. Related: `docs/plans/pending-prototypes.md` row "In-book search (reader)", `docs/sunniwiki-concept/README.md` (decision "in-book full-text search is dropped for now" → to be reversed by this plan).

## Goal

"Search in content" across all books (and scoped to a book / volume / chapter / author / category), done entirely by the API with a local search engine — no AI.
Decisions already agreed with the user:

- Engine: **OpenSearch** (single node, Docker), a *derived, rebuildable* index. MySQL + TEI stay the source of truth.
- The real unit is the **chapter / booklet**. Pages are display metadata only. Proximity (NEAR/N) is **chapter-wide**.
- Urdu **and** Arabic matter equally (custom analyzers, per-language fields).
- Phasing: 1 → 2 → 3 → 4 (below).
- **RAG-ready, not RAG now:** passages get stable IDs, parent links, anchors and a language tag so embeddings (OpenSearch k-NN) can be added later without a reindex design change. No vector features are built here.

## Architecture

```
import scripts ─► MySQL (TEI)  ─►  reindex script (TEI → passages → normalized text) ─► OpenSearch
Web (Next) ─► API (Fastify, /v1/search) ─► OpenSearch (HTTP)  ─► hits + highlighted snippets
```

Two document kinds in the index (one index each, or one index with a `kind` field — decided in task D2):

- **`passage`** — one paragraph / small block (a fatwa's question + answer stay together as one parent; see D3). Powers exact phrase, snippets, highlighting, jump-to-anchor in the reader, and future RAG chunks.
- **`chapter`** — one per chapter/booklet (full normalized text). Powers "all words anywhere in the same chapter", chapter-wide proximity (`span_near`), counts and chapter-level ranking.

Fields (both kinds): `bookId, volumeId, chapterId, authorId, categoryIds, level`. Passages add `passageId` (deterministic: `<chapterId>:<anchorId|seq>`), `parentId`, `anchorId`, `chunkOrder`, `pageNo` (info only), `lang`, `breadcrumb`, `text_ur`, `text_ar`, `text_en`, plus stored original text for display.

## Phases

| Phase | Scope |
|---|---|
| 1 | Index + normalization; all-words / any-words / exact phrase; scope filter; highlighted snippets; grouping by book → chapter |
| 2 | Proximity (NEAR/N, chapter-wide) and same-chapter AND; boolean (`-`, NOT, grouping); wildcard/prefix; autocomplete from corpus; reader integration (hit navigation) |
| 3 | Roman-Urdu/transliteration search; curated synonym/variant dictionary; Arabic root search; concordance + frequency charts; collocations |
| 4 | Citation/reference extraction; Quran ayat matching; near-duplicate detection |

## Database  (OpenSearch index + any MySQL additions)

| ID | Task | Phase | Status |
|---|---|---|---|
| D1 | Add OpenSearch to local dev: `docker-compose.yml` (single node, security disabled for dev, 1–2 GB heap, persistent volume) + env vars `SEARCH_URL`, `SEARCH_INDEX_PREFIX` in `apps/api/src/config/env.ts` | 1 | done (docker-compose.yml + env vars; compose file untested; verified instead with Homebrew OpenSearch 3.9.0, no Docker) |
| D2 | Index design & mappings: `passages` + `chapters` indices, field list above, `index_options: offsets` for the unified highlighter, `position_increment_gap` set so phrases do not cross passages, raise `index.highlight.max_analyzed_offset` for chapter docs | 1 | done (src/search/index-definition.ts) |
| D3 | Passage derivation service `apps/api/src/services/tei-passages.service.ts` (TEI → ordered passages; reuses the `fast-xml-parser` setup from `tei-markdown.service.ts` without modifying it): split by `<head>`/anchors/paragraphs, keep `<ab type=question>`+`<ab type=answer>` together as a parent, merge small / split huge paragraphs (~300–500 tokens), split `xml:lang` spans into `text_ur`/`text_ar`, keep Arabic quotes in the parent, drop figures/graphics, keep `<pb>` as `pageNo` metadata, build breadcrumb. Unit tests in `apps/api/test/` | 1 | done (+ tests) |
| D4 | Urdu analyzer: char_filters (strip harakat/tashkeel, tatweel, zero-width chars; fold ي/ی/ى, ك/ک, ه/ہ/ھ/ة, أ/إ/آ/ا, ۃ/ہ; unify digits; remove honorific ligatures ﷺ ﷻ and the standard رضی اللہ عنہ style formulas for matching; unify اللہ/الله), standard/ICU tokenizer, no stemmer. Same analyzer at index and query time | 1 | done (src/search/normalize.ts + analyzers) |
| D5 | Arabic analyzer: built-in `arabic` (normalization + light stemmer) plus the same shared char_filters as D4; English analyzer for `text_en` | 1 | done |
| D6 | Reindex script `apps/api/scripts/reindex-search.ts` (`pnpm search:reindex [--book slug] [--all]`): reads chapters + TEI, derives passages, bulk-indexes; **idempotent** (deterministic IDs, deletes the book's old docs first, scoped by `bookId`); runs after any book re-import. Add the step to the import docs/run-order | 1 | done (verified 2026-11-16: full reindex on OpenSearch 3.9.0 via Homebrew; 6,990 chapters, 97,682 passages) |
| D7 | Wildcard/prefix support (`edge_ngram` or `wildcard` field for terms) and an `autocomplete` terms index | 2 | todo |
| D8 | Roman-Urdu: transliteration field (`text_rom`) built at reindex + query-time transliteration of Latin input | 3 | todo |
| D9 | MySQL table `search_synonyms` (curated variants/synonyms/transliterations; Prisma migration via `pnpm prisma migrate deploy` only) + seed in `apps/api/prisma/seed/` (idempotent upsert, run `pnpm db:seed`) + synonym-filter sync into OpenSearch | 3 | todo |
| D10 | Arabic root data (root dictionary file + `root` field populated at reindex) | 3 | todo |
| D11 | Reference extraction at reindex (`refs` field: book/volume/page citations, Quran ayat refs, hadith refs) and Quran reference text for ayat matching | 4 | todo |
| D12 | Near-duplicate fingerprints (shingles/MinHash) stored per passage | 4 | todo |

## API  (Fastify, Zod schemas, `/v1/search`)

| ID | Task | Phase | Status |
|---|---|---|---|
| A1 | OpenSearch client wrapper `src/config/search.ts` + health check entry in `health.service.ts` (search "degraded" must not break the rest of the API) | 1 | done |
| A2 | Schemas `src/schemas/search.ts` (query, mode `all|any|phrase`, scope: `bookIds[] | volumeId | chapterId | authorId | categoryId`, `lang: ur|ar|en|all`, sort `relevance|canonical|hits`, pagination) with OpenAPI docs | 1 | done |
| A3 | Query builder service `src/services/search.service.ts`: normalizes the query with the same rules as D4/D5, builds all/any/phrase queries over `text_ur`/`text_ar`/`text_en`, applies scope + status filters (inactive books/chapters never returned) | 1 | done |
| A4 | Route `GET /v1/search` — hits grouped by book → chapter with counts, highlighted snippets (KWIC, ~20 words each side), `chapterId`, `anchorId` for jump-to-hit, facets (per book/author/category counts) | 1 | done |
| A5 | Rate-limit + query-length/term-count caps for the search route | 1 | done |
| A6 | Proximity: `near(N)` operator via `span_near` on chapter docs (chapter-wide), same-chapter AND, query-string syntax parser (`"phrase"`, `-word`, `NOT`, `( )`, `word1 NEAR/5 word2`) with clear 400 errors on bad syntax | 2 | todo |
| A7 | Wildcard/prefix queries (`عبد*`, `?`) with safety caps (min prefix length) | 2 | todo |
| A8 | `GET /v1/search/suggest` — autocomplete real terms/phrases with counts | 2 | todo |
| A9 | `GET /v1/search/hits?chapterId=…&q=…` — ordered hit anchors in one chapter for next/previous-hit in the reader | 2 | todo |
| A10 | Roman-Urdu + synonym expansion in the query builder | 3 | todo |
| A11 | Arabic root search option (`root=1`) | 3 | todo |
| A12 | `GET /v1/search/frequency` (per book/volume counts) and `/collocations` (top neighbours of a term) | 3 | todo |
| A13 | Ayat/reference lookup endpoints (`/v1/search/refs`) and near-duplicate list per passage | 4 | todo |
| A14 | Tests: `apps/api/test/` unit tests for the normalizer and query builder; extend smoke test with a search request (skipped if OpenSearch is down) | 1 | done |

## Web  (apps/web — follow `docs/design-guidelines.md`, shadcn first, reuse existing components)

Per project workflow the pages are first shown as prototypes with dummy data and logged in `pending-prototypes.md`, then wired to the API. Because this plan is already API-first, each Web task below is built directly against the real API once A-tasks exist; any part built earlier on dummy data is logged as prototype.

| ID | Task | Phase | Status |
|---|---|---|---|
| W1 | Search page `/search` (query box, mode toggle all/any/phrase, language toggle, scope picker book/volume/author/category) using existing shadcn components; check existing command-palette/search components first and reuse | 1 | done |
| W2 | Results list grouped by book → chapter with counts, highlighted snippets, facet filters, sort control, pagination, empty/error/"search unavailable" states | 1 | done |
| W3 | Shareable URLs (query + scope + mode encoded in the query string); search-within-results | 1 | done |
| W4 | Reader integration: open a hit with the query carried over, highlight every hit in the chapter, next/previous-hit buttons (replaces the removed in-book search; see pending-prototypes row) | 2 | todo |
| W5 | Advanced syntax help (NEAR/N, quotes, `-word`, wildcards), proximity input (distance slider), autocomplete dropdown | 2 | todo |
| W6 | On-screen Urdu/Arabic keyboard and script auto-detection | 2 | todo |
| W7 | Search history + saved searches (local storage) | 2 | todo |
| W8 | Roman-Urdu hint, synonym "also searched" chips, root-search toggle | 3 | todo |
| W9 | Frequency chart per book/volume and collocations panel (follow the dataviz/design guidelines) | 3 | todo |
| W10 | Export results (print / CSV), citation + ayat links, near-duplicate "also appears in" | 4 | todo |
| W11 | Translations: **not** part of this plan unless the user asks | — | skipped |

## Documentation

| ID | Task | Phase | Status |
|---|---|---|---|
| Doc1 | `docs/sunniwiki-concept/README.md`: reverse the "in-book full-text search is dropped" decision; describe content search, the OpenSearch derived index, and the chapter-as-unit rule | 1 | done |
| Doc2 | `apps/api/docs/api-structure.md`: `/v1/search*` endpoints, query syntax, response shapes, error codes | 1 | done |
| Doc3 | New `apps/api/docs/search-index.md`: index design, analyzers/normalization rules, passage derivation rules, reindex run order, docker setup, how to rebuild | 1 | done |
| Doc4 | Add the `pnpm search:reindex` step to the run-order notes in `CLAUDE.md` and the data-import docs (after each book import) | 1 | done |
| Doc5 | "RAG-ready" note: passage ID scheme, parent links, anchors, language tags, and how k-NN embeddings would be added later (no implementation) | 1 | done |
| Doc6 | Update `docs/plans/pending-prototypes.md` (in-book search row; any prototype pages) when each phase lands | each | in progress |

## Execution order (after confirmation)

1. Phase 1 first. Run **Database (D1–D6)** and **API (A1–A5, A14)** in parallel where independent: D1/D2/D4/D5 and A1/A2 can start together; D3 and D6 follow; A3/A4 need D2 and D4/D5. **Web W1–W3** and **Doc1–Doc5** start once the A2 response shape is fixed.
2. Verify Phase 1 end to end (reindex all five books, search Urdu, Arabic and mixed queries, check highlighting and grouping) before starting Phase 2.
3. Repeat for Phases 2–4, one phase at a time, updating statuses in this file as tasks complete.

## Risks / notes

- Long chapters: highlighting must not rely on defaults; use offsets in postings and the raised limit (D2). Snippets come from passage docs.
- Mixed-language passages: Arabic quotes inside Urdu prose are indexed as separate language spans so each uses the right analyzer.
- Honorific/ligature stripping affects phrase matching only at analysis time; stored text for display is never altered.
- OpenSearch is optional at runtime: if it is down, `/v1/search` returns 503 and the rest of the app keeps working.
- Never write into `data-extracted/`; reindexing reads only from MySQL.
