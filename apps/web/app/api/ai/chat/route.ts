import { API_URL } from "@/lib/api/client"

/** Same-origin streaming proxy to the API's AI chat. The provider key lives only in apps/api. */
export async function POST(req: Request) {
  const res = await fetch(`${API_URL}/v1/ai/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await req.text(),
    signal: req.signal, // the user pressed Stop / closed the tab: cancel upstream too
    cache: "no-store",
  }).catch(() => null)
  if (!res) return Response.json({ message: "API unavailable" }, { status: 502 })
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store", "x-accel-buffering": "no" },
  })
}
