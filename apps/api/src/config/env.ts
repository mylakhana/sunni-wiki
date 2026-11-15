import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  RATE_LIMIT_MAX: z.coerce.number().default(600),
  /** Ask-AI: max estimated tokens (ceil(chars / 3)) of a selected context. */
  AI_MAX_CONTEXT_TOKENS: z.coerce.number().int().positive().default(200000),
  DATABASE_URL: z.string().min(1),
})

export const env = envSchema.parse(process.env)
