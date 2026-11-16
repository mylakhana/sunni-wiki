import "server-only"
import type { SearchState } from "@/lib/search-params"
import { SEARCH_PAGE_SIZE } from "@/lib/search-params"
import { ApiError, apiGet } from "./client"
import type { SearchResponseDto } from "./types"

export type SearchOutcome =
  | { status: "ok"; data: SearchResponseDto }
  /** 400: the query itself is not acceptable (too long, bad syntax, ...). `message` comes from the API. */
  | { status: "invalid"; message: string }
  /** Search engine / API down (503, network error, ...): the rest of the site keeps working. */
  | { status: "unavailable" }

/** Content search (GET /v1/search). Never cached: every query is different. Never throws. */
export async function searchContent(s: SearchState): Promise<SearchOutcome> {
  try {
    const data = await apiGet<SearchResponseDto>("/search", {
      q: s.q,
      mode: s.mode,
      lang: s.lang,
      bookIds: s.books.join(","),
      volumeId: s.volume,
      chapterId: s.chapter,
      authorId: s.author,
      categoryId: s.category,
      sort: s.sort,
      page: s.page,
      pageSize: SEARCH_PAGE_SIZE,
    })
    return { status: "ok", data }
  } catch (e) {
    if (e instanceof ApiError && (e.status === 400 || e.status === 422)) return { status: "invalid", message: e.detail ?? "This search is not valid. Try different words." }
    console.error("[web] search failed:", e instanceof Error ? e.message : e)
    return { status: "unavailable" }
  }
}
