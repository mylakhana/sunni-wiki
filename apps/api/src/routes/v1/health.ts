import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi"
import type { FastifyInstance } from "fastify"
import { prisma } from "../../config/prisma.js"
import { healthResponseSchema } from "../../schemas/health.js"
import { HealthService } from "../../services/health.service.js"

const healthService = new HealthService(prisma)

export default async function healthRoute(app: FastifyInstance) {
  app.withTypeProvider<FastifyZodOpenApiTypeProvider>().get(
    "/health",
    {
      schema: {
        tags: ["health"],
        summary: "Health check",
        response: { 200: healthResponseSchema },
      },
    },
    async () => healthService.check(),
  )
}
