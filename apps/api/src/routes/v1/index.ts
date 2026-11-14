import type { FastifyInstance } from "fastify"
import authorsRoute from "./authors.js"
import booksRoute from "./books.js"
import categoriesRoute from "./categories.js"
import healthRoute from "./health.js"

export default async function v1Routes(app: FastifyInstance) {
  await app.register(healthRoute)
  await app.register(categoriesRoute)
  await app.register(authorsRoute)
  await app.register(booksRoute)
}
