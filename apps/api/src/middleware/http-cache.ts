import { createHash } from "node:crypto"
import type { FastifyInstance } from "fastify"

declare module "fastify" {
  interface FastifyContextConfig {
    /** Cache policy for a GET route: seconds for max-age/s-maxage and stale-while-revalidate. */
    cache?: { maxAge: number; swr?: number }
  }
}

export const CACHE = {
  list: { maxAge: 300, swr: 600 },
  detail: { maxAge: 300, swr: 600 },
  chapter: { maxAge: 3600, swr: 86400 },
} as const

/**
 * Adds Cache-Control + weak ETag to 200 GET responses of routes declaring `config.cache`
 * and answers If-None-Match with 304. Register BEFORE @fastify/compress so the ETag is
 * computed on the uncompressed body.
 */
export function registerHttpCache(app: FastifyInstance) {
  app.addHook("onSend", async (request, reply, payload) => {
    const policy = request.routeOptions.config.cache
    if (request.method !== "GET" || reply.statusCode !== 200 || !policy || typeof payload !== "string") {
      return payload
    }
    const etag = `W/"${createHash("sha1").update(payload).digest("base64url")}"`
    reply.header("ETag", etag)
    reply.header(
      "Cache-Control",
      `public, max-age=${policy.maxAge}, s-maxage=${policy.maxAge}` +
        (policy.swr ? `, stale-while-revalidate=${policy.swr}` : ""),
    )
    reply.header("Vary", "Accept-Encoding")
    const inm = request.headers["if-none-match"]
    if (inm && inm.split(",").some((t) => t.trim() === etag || t.trim() === "*")) {
      reply.code(304)
      return ""
    }
    return payload
  })
}
