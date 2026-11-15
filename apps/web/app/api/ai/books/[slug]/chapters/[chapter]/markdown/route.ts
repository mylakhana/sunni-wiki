import { API_URL } from "@/lib/api/client"

/**
 * Same-origin proxy for the API's chapter Markdown (Ask AI context). The browser cannot call the API directly
 * (CORS is limited to the web origin and API_URL is server-side only). Conditional requests pass through, and
 * ETag / Cache-Control are preserved so the browser and the IndexedDB cache can revalidate cheaply.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; chapter: string }> }) {
  const { slug, chapter } = await params
  const headers: Record<string, string> = { accept: "application/json" }
  const inm = req.headers.get("if-none-match")
  if (inm) headers["if-none-match"] = inm
  const res = await fetch(`${API_URL}/v1/books/${encodeURIComponent(slug)}/chapters/${encodeURIComponent(chapter)}/markdown`, { headers, cache: "no-store" }).catch(() => null)
  if (!res) return new Response("API unavailable", { status: 502 })
  const out = new Headers()
  for (const h of ["etag", "cache-control"]) {
    const v = res.headers.get(h)
    if (v) out.set(h, v)
  }
  if (res.status === 304) return new Response(null, { status: 304, headers: out })
  if (!res.ok) return new Response(res.status === 404 ? "Not found" : "API error", { status: res.status === 404 ? 404 : 502 })
  out.set("content-type", "application/json; charset=utf-8")
  return new Response(res.body, { status: 200, headers: out })
}
