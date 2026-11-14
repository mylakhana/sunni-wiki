import compress from "@fastify/compress"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import sensible from "@fastify/sensible"
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import Fastify from "fastify"
import {
  fastifyZodOpenApiPlugin,
  fastifyZodOpenApiTransform,
  fastifyZodOpenApiTransformObject,
  serializerCompiler,
  validatorCompiler,
} from "fastify-zod-openapi"
import { env } from "./config/env.js"
import { errorHandler } from "./middleware/error-handler.js"
import { registerHttpCache } from "./middleware/http-cache.js"
import v1Routes from "./routes/v1/index.js"

export async function buildApp() {
  const app = Fastify({
    logger:
      env.NODE_ENV === "development"
        ? { level: env.LOG_LEVEL, transport: { target: "pino-pretty" } }
        : { level: env.LOG_LEVEL },
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)

  registerHttpCache(app) // before compress: ETag over the uncompressed body
  await app.register(sensible)
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, { origin: env.WEB_ORIGIN, methods: ["GET", "HEAD", "OPTIONS"] })
  await app.register(rateLimit, { max: env.RATE_LIMIT_MAX, timeWindow: "1 minute" })
  await app.register(compress, { global: true, threshold: 1024 })
  await app.register(fastifyZodOpenApiPlugin)
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: { title: "Sunni Wiki API", version: "1.0.0" },
    },
    transform: fastifyZodOpenApiTransform,
    transformObject: fastifyZodOpenApiTransformObject,
  })
  await app.register(swaggerUi, { routePrefix: "/docs" })

  await app.register(v1Routes, { prefix: "/v1" })

  return app
}
