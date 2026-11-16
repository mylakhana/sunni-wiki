/** URL state of the /search page (safe for server and client). The URL is the single source of truth, so every search is shareable. */
export const SEARCH_MODES = ["all", "any", "phrase"] as const
export const SEARCH_LANGS = ["all", "ur", "ar", "en"] as const
export const SEARCH_SORTS = ["relevance", "canonical", "hits"] as const
export type SearchMode = (typeof SEARCH_MODES)[number]
export type SearchLang = (typeof SEARCH_LANGS)[number]
export type SearchSort = (typeof SEARCH_SORTS)[number]

export const SEARCH_PAGE_SIZE = 20
export const SEARCH_MAX_QUERY = 200 // = API limit (also max 20 words)

export type SearchState = {
  q: string
  mode: SearchMode
  lang: SearchLang
  /** Numeric book ids (API `bookIds`, comma separated in the URL). */
  books: number[]
  author: number | null
  category: number | null
  volume: number | null
  chapter: number | null
  sort: SearchSort
  page: number
}

type Raw = Record<string, string | string[] | undefined> | URLSearchParams
const get = (raw: Raw, k: string) => {
  const v = raw instanceof URLSearchParams ? raw.get(k) : raw[k]
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? ""
}
const pick = <T extends string>(v: string, allowed: readonly T[], fallback: T): T => (allowed as readonly string[]).includes(v) ? (v as T) : fallback
const id = (v: string) => (/^\d{1,9}$/.test(v) ? Number(v) : null)

export function parseSearchState(raw: Raw): SearchState {
  return {
    q: get(raw, "q").slice(0, SEARCH_MAX_QUERY),
    mode: pick(get(raw, "mode"), SEARCH_MODES, "all"),
    lang: pick(get(raw, "lang"), SEARCH_LANGS, "all"),
    books: get(raw, "books").split(",").map(id).filter((n): n is number => n !== null).slice(0, 50),
    author: id(get(raw, "author")),
    category: id(get(raw, "category")),
    volume: id(get(raw, "volume")),
    chapter: id(get(raw, "chapter")),
    sort: pick(get(raw, "sort"), SEARCH_SORTS, "relevance"),
    page: Math.max(1, Number.parseInt(get(raw, "page"), 10) || 1),
  }
}

/** Query string for the page URL (defaults are omitted to keep shared links short). */
export function searchQueryString(s: SearchState): string {
  const p = new URLSearchParams()
  if (s.q) p.set("q", s.q)
  if (s.mode !== "all") p.set("mode", s.mode)
  if (s.lang !== "all") p.set("lang", s.lang)
  if (s.books.length) p.set("books", s.books.join(","))
  if (s.author) p.set("author", String(s.author))
  if (s.category) p.set("category", String(s.category))
  if (s.volume) p.set("volume", String(s.volume))
  if (s.chapter) p.set("chapter", String(s.chapter))
  if (s.sort !== "relevance") p.set("sort", s.sort)
  if (s.page > 1) p.set("page", String(s.page))
  return p.toString()
}

export const searchHref = (s: SearchState) => {
  const qs = searchQueryString(s)
  return qs ? `/search?${qs}` : "/search"
}

/** Same search with some fields changed; a change of filters always goes back to page 1. */
export const withState = (s: SearchState, patch: Partial<SearchState>): SearchState => ({ ...s, page: 1, ...patch })
