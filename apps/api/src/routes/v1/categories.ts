import type { FastifyInstance } from "fastify"
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi"
import { z } from "zod"
import { prisma } from "../../config/prisma.js"
import { CACHE } from "../../middleware/http-cache.js"
import { categorySchema } from "../../schemas/library.js"
import { LibraryService } from "../../services/library.service.js"

export default async function categoriesRoute(app: FastifyInstance) {
  const service = new LibraryService(prisma, app)
  app.withTypeProvider<FastifyZodOpenApiTypeProvider>().get(
    "/categories",
    {
      config: { cache: CACHE.list },
      schema: {
        tags: ["categories"],
        summary: "List all categories with their published book count",
        response: { 200: z.object({ data: z.array(categorySchema).describe("Categories ordered by sort") }) },
      },
    },
    async () => service.categories(),
  )
}
