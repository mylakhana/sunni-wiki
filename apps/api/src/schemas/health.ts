import { z } from "zod"

export const healthResponseSchema = z
  .object({
    status: z.literal("ok").describe("Service status"),
    uptime: z.number().describe("Process uptime in seconds"),
    database: z.enum(["up", "down"]).describe("Database connectivity"),
  })
  .describe("Health check response")
