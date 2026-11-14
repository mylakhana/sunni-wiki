import type { FastifyError, FastifyReply, FastifyRequest } from "fastify"

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500
  if (statusCode >= 500) request.log.error(error)
  else request.log.warn(error.message)

  reply.status(statusCode).send({
    statusCode,
    error: statusCode >= 500 ? "Internal Server Error" : (error.name ?? "Error"),
    message: statusCode >= 500 ? "Internal Server Error" : error.message,
  })
}
