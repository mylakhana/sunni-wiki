import type { FastifyError, FastifyReply, FastifyRequest } from "fastify"

const NAMES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  413: "Payload Too Large",
  429: "Too Many Requests",
}

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  const code = (error as { code?: string }).code
  let statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500
  let message = error.message
  let details: unknown

  if (error.validation) {
    statusCode = 400
    message = "Validation failed"
    details = error.validation.map((v) => ({
      path: v.instancePath || "",
      message: v.message,
    }))
  } else if (code === "P2025") {
    statusCode = 404
    message = "Resource not found"
  }

  if (statusCode >= 500) {
    request.log.error({ err: error, reqId: request.id }, "request failed")
    message = "Internal Server Error"
  } else request.log.warn({ reqId: request.id }, message)

  reply.status(statusCode).send({
    statusCode,
    error: NAMES[statusCode] ?? (statusCode >= 500 ? "Internal Server Error" : "Error"),
    message,
    ...(details ? { details } : {}),
  })
}
