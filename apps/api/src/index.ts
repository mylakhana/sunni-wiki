import { buildApp } from "./app.js"
import { env } from "./config/env.js"
import { prisma } from "./config/prisma.js"

const app = await buildApp()

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  })
}

try {
  await app.listen({ port: env.PORT, host: env.HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
