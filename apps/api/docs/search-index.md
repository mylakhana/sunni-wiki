# Content search index (OpenSearch)

Plan: `docs/plans/content-search.md`. Route/response docs: `docs/api-structure.md` ("Content search"). Concept: `docs/sunniwiki-concept/README.md` ("Content search").

**The index is a derived copy.** MySQL + TEI (`content.tei`) stay the source of truth; the whole index can be deleted and rebuilt at any time. If OpenSearch is down, `GET /v1/search` answers 503 and nothing else is affected.

## Run it
- Start OpenSearch (single node, plain http, dev only) from the repo root: `docker compose up -d opensearch` (`docker-compose.yml`; ~1 GB heap, data in the `opensearch-data` volume, listens on `127.0.0.1:9200`).
- Env (`apps/api/.env`, defaults in `src/config/env.ts`): `SEARCH_URL` (`http://localhost:9200`), `SEARCH_INDEX_PREFIX` (`sunniwiki`), `SEARCH_RATE_LIMIT_MAX` (60 requests/min on `/v1/search`).
- Build / rebuild (from `apps/api`): `pnpm search:reindex --all` or `--book <book-slug>`. Run it after **every (re-)import** of a book (after `chapters_titles_sync.py --mode fix` when doing a full re-import, so titles are final). It is idempotent: deterministic document ids, and a book's old documents are deleted (scoped by `bookId`) before it is indexed again. Indices whose `_meta.schemaVersion` differs from `INDEX_SCHEMA_VERSION` (`src/search/index-definition.ts`) are recreated, which needs a full `--all` reindex.
- Tests: `pnpm test:unit` (pure: passage derivation, normalization, query builders).

## Indices
Names: `<prefix>_passages` and `<prefix>_chapters` (mappings are `dynamic: strict`; definition in `src/search/index-definition.ts`).

| | `passages` | `chapters` |
|---|---|---|
| One doc per | paragraph-sized block (a fatwa's question and answer are separate passages under one parent) | chapter / booklet (all its passages concatenated; `position_increment_gap` keeps phrases from crossing passages) |
| Used for | exact phrase, snippets, highlighting, jump-to-anchor, future RAG chunks | "all words anywhere in the same chapter", counts, chapter-level ranking, facets, later chapter-wide proximity |
| Text fields | `text_ur`, `text_ar`, `text_en` (analysed) + `display` (original, stored only) | `text_ur`, `text_ar`, `text_en` |
| Filters | `bookId`, `volumeId`, `chapterId`, `authorId`, `categoryIds`, `level` | same |
| Extra | `passageId`, `parentId`, `anchorId`, `seq`, `chunkOrder`, `pageNo`, `lang`, `role`, `heading`, `breadcrumb`, titles/slugs for display | `passageCount`, `breadcrumb`, titles/slugs |

Highlighting uses `index_options: offsets` (unified highlighter reads the postings, fast on long chapters); the chapters index raises `highlight.max_analyzed_offset`.

## Passage derivation (`src/services/tei-passages.service.ts`, pure, tested)
TEI -> ordered passages, using the same TEI conventions as `tei-markdown.service.ts` (which is untouched).
- **Parent unit** = every `<div>` that directly holds `<ab type="question|answer">` (a fatwa: heading + question + answer). Other text belongs to the chapter's root parent. Question / answer / body text is never merged into one passage.
- Small blocks of the same role are merged up to ~400 tokens (`target` chars); blocks above `splitAbove` are split on sentence boundaries. Headings start a new passage. An `<anchor xml:id>` always starts a new passage so reader jump targets survive merges.
- **Languages are split:** Arabic quotes inside Urdu prose go to `text_ar`, so each span uses its own analyzer. `lang` = dominant language of the passage.
- `<pb n>` is metadata only (`pageNo`), never a boundary. Footnotes are appended to their paragraph. `figure`, `graphic`, `index`, `milestone` are dropped.
- Passage ids are deterministic: `<chapterId>:<anchorId|seq>` — stable across reindexing.

## Normalization (`src/search/normalize.ts`, rules written once as data)
The OpenSearch analyzers are generated from the same tables the JS functions use, so index time and query time always agree. Displayed text is never changed.
- **Stripped:** harakat/tashkeel, superscript alef (اللّٰہ), Quranic annotation marks, tatweel, zero-width / bidi controls; honorific ligatures ﷺ ﷻ etc. (so "حضور ﷺ نے" matches "حضور نے"). Written-out formulas (رضی اللہ عنہ) are kept.
- **Folded:** Urdu canonical letters ی ک ہ (from ي ى ك ة ه ۃ …), alef variants -> ا, ﷲ -> اللہ / الله, Arabic-Indic and Eastern digits -> 0-9. ھ (do-chashmi) and ے stay distinct in Urdu.
- **Analyzers:** `ur_norm` (char filters + standard tokenizer + lowercase, **no stemmer**), `ar_norm` (same filters mapped to Arabic letters + `arabic_normalization` + `arabic_stem`), `en_std` (standard + lowercase + asciifolding).

## Query behaviour (`src/services/search-query.ts`, `search.service.ts`)
- `mode=all|any|phrase` over `text_ur`/`text_ar`/`text_en` (or one language via `lang`); `all` = every word in the **same chapter** (chapters index), snippets come from the passages index.
- Scope filters (`bookIds`, `volumeId`, `chapterId`, `authorId`, `categoryIds`) are applied on both indices; inactive chapters/books are not returned.
- Query caps: 200 chars, 20 words. OpenSearch errors that are not "unreachable / index missing" are logged as bugs, not turned into 503.

## RAG-ready (not built, by design)
Nothing vector-related exists yet. The passage design leaves room so RAG can be added **without redesigning the index**:
- stable passage ids (`chapterId:anchorId|seq`), `parentId` (small-to-big retrieval: embed a passage, give the LLM the parent fatwa/section), `anchorId` and `breadcrumb` (citations), `lang` (separate Urdu/Arabic chunks of one parent), `role` (question/answer kept linked), `pageNo` (citation detail).
- Later: add a `knn_vector` `embedding` field to `passages` (OpenSearch k-NN, so no separate vector DB), generate embeddings in a separate step keyed by `passageId`, and combine BM25 + vector scores (hybrid search). Use a multilingual model that handles Urdu and Arabic and measure chunk size in tokens, not characters.

## Roadmap (not implemented yet)
Phase 2: NEAR/N proximity (chapter-wide `span_near`), boolean `-word`/`NOT`/groups, wildcards, autocomplete, reader hit navigation. Phase 3: Roman-Urdu, curated synonyms (MySQL `search_synonyms`), Arabic roots, frequency/collocation views. Phase 4: reference/Quran matching, near-duplicates. See the plan for task ids.

## Running OpenSearch without Docker (macOS, Homebrew)

`brew install opensearch` (3.9.0 as of 2026-11; works with the analyzers/mappings here), then add to `/opt/homebrew/etc/opensearch/opensearch.yml`:

```yaml
discovery.type: single-node
network.host: 127.0.0.1
http.port: 9200
```

The Homebrew build has no security plugin, so do **not** add `plugins.security.disabled`. Start with `brew services start opensearch`, then `pnpm search:reindex --all` from `apps/api`.

**Low disk space:** OpenSearch blocks writes at 95% disk usage (`flood_stage`) and sets `cluster.blocks.create_index=true` persistently. On a nearly full disk, lower the watermarks (`cluster.routing.allocation.disk.watermark.{low,high,flood_stage}` to absolute values such as `1500mb`/`1000mb`/`500mb`) and set `cluster.blocks.create_index` back to `false`. The full index is ~320 MB.
