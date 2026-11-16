import type { FastifyInstance } from "fastify"
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi"
import { env } from "../../config/env.js"
import { prisma } from "../../config/prisma.js"
import { CACHE } from "../../middleware/http-cache.js"
import { errorResponseSchema } from "../../schemas/error.js"
import { searchQuerySchema, searchResponseSchema } from "../../schemas/search.js"
import { SearchService } from "../../services/search.service.js"

export default async function searchRoute(app: FastifyInstance) {
  const search = new SearchService(prisma, app)

  app.withTypeProvider<FastifyZodOpenApiTypeProvider>().get(
    "/search",
    {
      // tighter than the global limit: each request fans out to 2-4 OpenSearch queries
      config: { cache: CACHE.search, rateLimit: { max: env.SEARCH_RATE_LIMIT_MAX, timeWindow: "1 minute" } },
      schema: {
        tags: ["search"],
        summary: "Search in content (full text), grouped by book and chapter with highlighted snippets",
        querystring: searchQuerySchema,
        response: { 200: searchResponseSchema, 400: errorResponseSchema, 503: errorResponseSchema },
      },
    },
    async (req) => search.search(req.query),
  )
}
