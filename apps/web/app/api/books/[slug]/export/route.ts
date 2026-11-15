import { API_URL } from "@/lib/api/client"

/** Streams the API's whole-book TEI ZIP to the browser (the API URL is server-side only). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const res = await fetch(`${API_URL}/v1/books/${encodeURIComponent(slug)}/export`, { cache: "no-store" }).catch(() => null)
  if (!res?.ok || !res.body) return new Response("Export unavailable", { status: res?.status === 404 ? 404 : 502 })
  return new Response(res.body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": res.headers.get("content-disposition") ?? `attachment; filename="${slug}-tei.zip"`,
    },
  })
}
