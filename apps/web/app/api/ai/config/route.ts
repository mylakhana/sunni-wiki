import { API_URL } from "@/lib/api/client"

/** Which AI the server chat uses (provider, model, window, configured?). No key is ever returned. */
export async function GET() {
  const res = await fetch(`${API_URL}/v1/ai/config`, { cache: "no-store" }).catch(() => null)
  if (!res?.ok) return Response.json({ data: { configured: false, provider: "", model: "", contextTokens: 0 } })
  return Response.json(await res.json(), { headers: { "cache-control": "no-store" } })
}
