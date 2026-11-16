import { z } from "zod"

export const healthResponseSchema = z
  .object({
    status: z.literal("ok").describe("Service status"),
    uptime: z.number().describe("Process uptime in seconds"),
    database: z.enum(["up", "down"]).describe("Database connectivity"),
    search: z.enum(["up", "down"]).describe("OpenSearch connectivity (optional dependency: down never fails the API)"),
  })
  .describe("Health check response")
