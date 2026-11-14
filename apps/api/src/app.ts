import cors from "@fastify/cors"
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

  await app.register(cors)
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
