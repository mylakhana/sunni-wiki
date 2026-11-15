import type { FastifyInstance } from "fastify"
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi"
import { z } from "zod"
import { aiConfig, AiUpstreamError, streamAiChat } from "../../services/ai.service.js"

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().min(1) }))
    .min(1)
    .max(200),
})

export default async function aiRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>()

  r.get("/ai/config", { schema: { tags: ["ai"], summary: "Which AI the server chat uses (never includes the key)" } }, async (_req, reply) => {
    reply.header("cache-control", "no-store")
    return { data: aiConfig() }
  })

  /** Streams the reply as NDJSON: {message:{content?,thinking?}} lines, then {done:true,prompt_eval_count,eval_count}. */
  r.post(
    "/ai/chat",
    {
      bodyLimit: 8 * 1024 * 1024, // a 200k-token context is ~1 MB of Arabic/Urdu text
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: { tags: ["ai"], summary: "Chat with the configured AI provider (streamed)", body: bodySchema },
    },
    async (req, reply) => {
      const ac = new AbortController()
      reply.raw.on("close", () => { if (!reply.raw.writableEnded) ac.abort() }) // client left: stop paying for tokens
      const stream = streamAiChat(req.body.messages, ac.signal)
      // pull the first chunk before committing to a 200 so provider errors surface with a real status
      let first: IteratorResult<Awaited<ReturnType<typeof stream.next>>["value"]>
      try {
        first = await stream.next()
      } catch (e) {
        if (e instanceof AiUpstreamError) return reply.status(e.status).send({ statusCode: e.status, error: "AI Error", message: e.message })
        throw e
      }
      reply.hijack()
      const raw = reply.raw
      raw.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" })
      const write = (c: unknown) => raw.write(JSON.stringify(c) + "\n")
      try {
        if (!first.done) write(first.value)
        for await (const c of stream) write(c)
      } catch (e) {
        if (!ac.signal.aborted) write({ error: e instanceof Error ? e.message : "AI stream failed" })
      } finally {
        raw.end()
      }
    },
  )
}
