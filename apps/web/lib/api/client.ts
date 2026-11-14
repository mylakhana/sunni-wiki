import "server-only"
import type { ItemResponse, ListResponse } from "./types"

export const API_URL = (process.env.API_URL ?? "http://localhost:3001").replace(/\/+$/, "")

/** status 0 = network/parse failure, otherwise the HTTP status. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = "ApiError"
  }
  get notFound() {
    return this.status === 404
  }
}

type Query = Record<string, string | number | null | undefined>

function url(path: string, query?: Query) {
  const u = new URL(`${API_URL}/v1${path}`)
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v))
  return u.toString()
}

async function request<T>(path: string, query?: Query): Promise<T> {
  let res: Response
  try {
    res = await fetch(url(path, query), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) })
  } catch (e) {
    throw new ApiError(0, `API unreachable (${path}): ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!res.ok) throw new ApiError(res.status, `API ${res.status} for ${path}`)
  try {
    return (await res.json()) as T
  } catch {
    throw new ApiError(0, `Invalid JSON from ${path}`)
  }
}

/** GET a single resource (`{ data }` envelope). */
export async function apiItem<T>(path: string, query?: Query): Promise<T> {
  return (await request<ItemResponse<T>>(path, query)).data
}

/** GET every page of a list resource by following `nextCursor`. */
export async function apiAll<T>(path: string, query: Query = {}, limit = 200): Promise<T[]> {
  const out: T[] = []
  let cursor: string | null = null
  for (let page = 0; page < 200; page++) {
    const res: ListResponse<T> = await request<ListResponse<T>>(path, { ...query, limit, cursor })
    out.push(...res.data)
    if (!res.nextCursor) break
    cursor = res.nextCursor
  }
  return out
}
