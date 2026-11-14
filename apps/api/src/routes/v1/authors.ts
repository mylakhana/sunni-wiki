import type { FastifyInstance } from "fastify"
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi"
import { prisma } from "../../config/prisma.js"
import { CACHE } from "../../middleware/http-cache.js"
import { listOf, paginationQuerySchema, single, slugParamSchema } from "../../schemas/common.js"
import { authorDetailSchema, authorSchema } from "../../schemas/library.js"
import { LibraryService } from "../../services/library.service.js"

export default async function authorsRoute(app: FastifyInstance) {
  const service = new LibraryService(prisma, app)
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>()

  r.get(
    "/authors",
    {
      config: { cache: CACHE.list },
      schema: {
        tags: ["authors"],
        summary: "List authors (paginated)",
        querystring: paginationQuerySchema(),
        response: { 200: listOf(authorSchema) },
      },
    },
    async (req) => service.authors(req.query.limit, req.query.cursor),
  )

  r.get(
    "/authors/:slug",
    {
      config: { cache: CACHE.detail },
      schema: {
        tags: ["authors"],
        summary: "Author detail with their published books",
        params: slugParamSchema,
        response: { 200: single(authorDetailSchema) },
      },
    },
    async (req) => service.author(req.params.slug),
  )
}
