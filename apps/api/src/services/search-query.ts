/**
 * Pure helpers that build OpenSearch query DSL for /v1/search (no I/O, no env).
 * Normalization is NOT done here: queries run against fields whose analyzers
 * (ur_norm / ar_norm / en_std, defined in the index mappings) normalize the query
 * text exactly as the indexed text, so index and query always agree.
 */

export type SearchMode = "all" | "any" | "phrase"
export type SearchLang = "ur" | "ar" | "en" | "all"

export const MAX_QUERY_CHARS = 200
export const MAX_QUERY_TERMS = 20

const FIELD = { ur: "text_ur", ar: "text_ar", en: "text_en" } as const

export function fieldsFor(lang: SearchLang): string[] {
  return lang === "all" ? [FIELD.ur, FIELD.ar, FIELD.en] : [FIELD[lang]]
}

/** Collapse whitespace, drop control chars; returns null when empty / over the caps. */
export function cleanQuery(q: string): { text: string; terms: number } | { error: string } {
  // eslint-disable-next-line no-control-regex
  const text = q.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
  if (!text) return { error: "Query is empty" }
  if (text.length > MAX_QUERY_CHARS) return { error: `Query is longer than ${MAX_QUERY_CHARS} characters` }
  const terms = text.split(" ").length
  if (terms > MAX_QUERY_TERMS) return { error: `Query has more than ${MAX_QUERY_TERMS} words` }
  return { text, terms }
}

/** Comma-separated ids ("1,2,3") -> number[] (deduped, max 100). */
export function parseIds(csv: string | undefined): number[] {
  if (!csv) return []
  return [...new Set(csv.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 100)
}

export type Scope = {
  bookIds?: number[]
  volumeId?: number
  chapterId?: number
  authorId?: number
  categoryId?: number
}

export function scopeFilters(s: Scope): object[] {
  const f: object[] = []
  if (s.bookIds?.length) f.push({ terms: { bookId: s.bookIds } })
  if (s.volumeId) f.push({ term: { volumeId: s.volumeId } })
  if (s.chapterId) f.push({ term: { chapterId: s.chapterId } })
  if (s.authorId) f.push({ term: { authorId: s.authorId } })
  if (s.categoryId) f.push({ term: { categoryIds: s.categoryId } })
  return f
}

/** The text part of the query: one clause per language field, any field may match. */
export function textQuery(mode: SearchMode, text: string, fields: string[]): object {
  const clause = (f: string) =>
    mode === "phrase"
      ? { match_phrase: { [f]: { query: text } } }
      : { match: { [f]: { query: text, operator: mode === "all" ? "and" : "or" } } }
  return { bool: { should: fields.map(clause), minimum_should_match: 1 } }
}

/** Snippet queries on passages use OR for "all": the chapter-level AND already guarantees the words occur. */
export const snippetMode = (m: SearchMode): SearchMode => (m === "all" ? "any" : m)

export function highlightSpec(fields: string[]) {
  return {
    pre_tags: ["<mark>"],
    post_tags: ["</mark>"],
    encoder: "html",
    fields: Object.fromEntries(fields.map((f) => [f, { fragment_size: 260, number_of_fragments: 1 }])),
  }
}

export type Facet = { id: number; count: number }
export const facetAggs = {
  books: { terms: { field: "bookId", size: 100 } },
  authors: { terms: { field: "authorId", size: 100 } },
  categories: { terms: { field: "categoryIds", size: 100 } },
}

export function readFacet(agg: unknown): Facet[] {
  const buckets = (agg as { buckets?: { key: number; doc_count: number }[] } | undefined)?.buckets ?? []
  return buckets.map((b) => ({ id: Number(b.key), count: b.doc_count }))
}

export type RawInnerHit = {
  _source?: { anchorId?: string | null }
  highlight?: Record<string, string[]>
}

const QUOTE_LEN = 60
const QUOTE_MIN = 25
const ENTITY: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'" }

/**
 * Text that locates the paragraph holding a hit: ~60 chars of the highlight fragment starting at the first <mark>
 * (extended backwards when the fragment ends soon after it). The reader finds this text in the chapter and
 * highlights the whole paragraph around it (`?q=…&b=1`). Passage `display` is not used: it carries footnotes at its
 * end, which the reader renders elsewhere.
 */
export function quoteAtHit(html: string): { q: string; e: null } | null {
  const plain = (s: string) => s.replace(/<\/?mark>/g, "").replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (m) => ENTITY[m] ?? m)
  const at = html.indexOf("<mark>")
  const before = plain(at < 0 ? "" : html.slice(0, at))
  const rest = plain(at < 0 ? html : html.slice(at))
  let q = rest.slice(0, QUOTE_LEN)
  if (q.length < QUOTE_MIN) q = (before + rest).slice(-Math.max(QUOTE_MIN, q.length + 20), undefined).slice(0, QUOTE_LEN + 20)
  q = q.replace(/\s+/g, " ").trim()
  return q ? { q, e: null } : null
}

/** First highlighted fragment of each inner hit, tagged with its language. */
export function toSnippets(hits: RawInnerHit[], fields: string[]) {
  const out: {
    anchorId: string | null
    lang: "ur" | "ar" | "en"
    html: string
    quote: { q: string; e: null } | null
  }[] = []
  for (const h of hits) {
    for (const f of fields) {
      const html = h.highlight?.[f]?.[0]
      if (html) {
        out.push({
          anchorId: h._source?.anchorId ?? null,
          lang: f.slice(5) as "ur" | "ar" | "en",
          html,
          quote: quoteAtHit(html),
        })
        break
      }
    }
  }
  return out
}
