import { z } from "zod"

export const errorResponseSchema = z
  .object({
    statusCode: z.number().describe("HTTP status code"),
    error: z.string().describe("HTTP error name"),
    message: z.string().describe("Human readable error message"),
  })
  .describe("Error response")
