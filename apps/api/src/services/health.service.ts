import { searchPing } from "../config/search.js"
import type { PrismaClient } from "../generated/prisma/client.js"

export class HealthService {
  constructor(private readonly db: PrismaClient) {}

  async check() {
    let database: "up" | "down" = "up"
    try {
      await this.db.$queryRaw`SELECT 1`
    } catch {
      database = "down"
    }
    const search: "up" | "down" = (await searchPing()) ? "up" : "down"
    return { status: "ok" as const, uptime: process.uptime(), database, search }
  }
}
