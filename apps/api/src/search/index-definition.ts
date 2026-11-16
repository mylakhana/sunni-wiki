/**
 * OpenSearch index definitions for content search (derived from MySQL/TEI; rebuild with `pnpm search:reindex`).
 * Shared contract (see docs/plans/content-search.md and apps/api/docs/search-index.md):
 *   indices   `${prefix}_passages` (paragraph-level) and `${prefix}_chapters` (one doc per chapter/booklet)
 *   analyzers `ur_norm`, `ar_norm`, `en_std` — used at index AND query time (same char filters as src/search/normalize.ts)
 */
import { ARABIC_FOLDS, HONORIFIC_CLASS, STRIP_CLASS, URDU_FOLDS, toMappings } from "./normalize.js"

/** Bump when mappings/analyzers change: the reindex script recreates indices whose `_meta.schemaVersion` differs. */
export const INDEX_SCHEMA_VERSION = 1

export const indexNames = (prefix: string) => ({
  passages: `${prefix}_passages`,
  chapters: `${prefix}_chapters`,
})

/** Gap between array values (passages of a chapter): phrases / NEAR distances below this never cross passages. */
export const POSITION_GAP = 100

const analysis = {
  char_filter: {
    sw_strip_marks: { type: "pattern_replace", pattern: STRIP_CLASS, replacement: "" },
    sw_strip_honorifics: { type: "pattern_replace", pattern: HONORIFIC_CLASS, replacement: "" },
    sw_fold_ur: { type: "mapping", mappings: toMappings(URDU_FOLDS) },
    sw_fold_ar: { type: "mapping", mappings: toMappings(ARABIC_FOLDS) },
  },
  analyzer: {
    ur_norm: {
      type: "custom",
      char_filter: ["sw_strip_marks", "sw_strip_honorifics", "sw_fold_ur"],
      tokenizer: "standard",
      filter: ["lowercase"],
    },
    ar_norm: {
      type: "custom",
      char_filter: ["sw_strip_marks", "sw_strip_honorifics", "sw_fold_ar"],
      tokenizer: "standard",
      filter: ["lowercase", "arabic_normalization", "arabic_stem"],
    },
    en_std: {
      type: "custom",
      tokenizer: "standard",
      filter: ["lowercase", "asciifolding"],
    },
  },
}

const textField = (analyzer: string) => ({
  type: "text",
  analyzer,
  index_options: "offsets", // lets the unified highlighter work from the postings (no re-analysis, fast on long chapters)
  position_increment_gap: POSITION_GAP,
})

/** Stored for display only (never searched). */
const stored = { type: "keyword", index: false, doc_values: false }

const common = {
  bookId: { type: "integer" },
  volumeId: { type: "integer" },
  chapterId: { type: "integer" },
  authorId: { type: "integer" },
  categoryIds: { type: "integer" },
  level: { type: "integer" },
  // display helpers so the API can render hits without extra MySQL lookups
  bookSlug: { type: "keyword" },
  volumeSlug: { type: "keyword" },
  chapterSlug: { type: "keyword" },
  titleUr: stored,
  titleAr: stored,
  titleEn: stored,
  text_ur: textField("ur_norm"),
  text_ar: textField("ar_norm"),
  text_en: textField("en_std"),
}

const settings = (extra: Record<string, unknown> = {}) => ({
  number_of_shards: 1,
  number_of_replicas: 0,
  analysis,
  ...extra,
})

export const passagesIndexBody = {
  settings: settings(),
  mappings: {
    _meta: { schemaVersion: INDEX_SCHEMA_VERSION },
    dynamic: "strict",
    properties: {
      ...common,
      passageId: { type: "keyword" }, // `<chapterId>:<anchorId|seq>`, deterministic
      parentId: { type: "keyword" }, // passageId of the first passage of the parent unit (fatwa / section)
      anchorId: { type: "keyword" }, // xml:id of the <anchor/> that starts this passage (jump target in the reader)
      seq: { type: "integer" }, // order within the chapter (canonical sort)
      chunkOrder: { type: "integer" }, // order within the parent unit
      pageNo: { type: "keyword" }, // info only, e.g. "39-41"
      lang: { type: "keyword" }, // dominant language: ur | ar | en
      role: { type: "keyword" }, // question | answer | body
      heading: stored,
      breadcrumb: stored,
      display: stored, // original (un-normalized) text for snippets / reader
    },
  },
}

export const chaptersIndexBody = {
  settings: settings({ "highlight.max_analyzed_offset": 10_000_000 }),
  mappings: {
    _meta: { schemaVersion: INDEX_SCHEMA_VERSION },
    dynamic: "strict",
    properties: {
      ...common,
      passageCount: { type: "integer" },
      breadcrumb: stored,
    },
  },
}
