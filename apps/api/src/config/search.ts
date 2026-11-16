import { env } from "./env.js"

/** Minimal OpenSearch REST client (fetch only; no dependency, so search stays optional). */

export const SEARCH_INDEX = {
  passages: `${env.SEARCH_INDEX_PREFIX}_passages`,
  chapters: `${env.SEARCH_INDEX_PREFIX}_chapters`,
} as const

/** OpenSearch is unreachable, timed out, or the index has not been built yet. */
export class SearchUnavailableError extends Error {
  constructor(message = "Search is temporarily unavailable") {
    super(message)
  }
}

/** OpenSearch rejected the request (bad query DSL); a bug on our side, not a 503. */
export class SearchRequestError extends Error {}

export async function searchRequest<T>(
  path: string,
  body?: unknown,
  opts: { method?: "GET" | "POST"; timeoutMs?: number } = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${env.SEARCH_URL}${path}`, {
      method: opts.method ?? (body === undefined ? "GET" : "POST"),
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    })
  } catch {
    throw new SearchUnavailableError()
  }
  if (res.ok) return (await res.json()) as T
  const text = await res.text().catch(() => "")
  if (res.status === 404 && text.includes("index_not_found_exception")) {
    throw new SearchUnavailableError("Search index is not built yet (run pnpm search:reindex)")
  }
  if (res.status >= 500 || res.status === 429) throw new SearchUnavailableError()
  throw new SearchRequestError(`OpenSearch ${res.status}: ${text.slice(0, 500)}`)
}

export const searchIndex = <T>(index: keyof typeof SEARCH_INDEX, body: unknown) =>
  searchRequest<T>(`/${SEARCH_INDEX[index]}/_search`, body)

/** true when OpenSearch answers within 1.5 s. */
export async function searchPing(): Promise<boolean> {
  try {
    await searchRequest("/", undefined, { timeoutMs: 1500 })
    return true
  } catch {
    return false
  }
}
