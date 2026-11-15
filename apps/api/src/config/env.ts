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
  /** Ask-AI chat provider (any OpenAI-compatible service). Chat is disabled in the UI (local Ollama only) until AI_API_KEY is set. */
  AI_PROVIDER: z.enum(["deepseek"]).default("deepseek"),
  AI_MODEL: z.string().min(1).default("deepseek-chat"),
  AI_API_KEY: z.string().optional(),
  /** Optional: override the provider's default OpenAI-compatible base URL (e.g. https://api.deepseek.com). */
  AI_BASE_URL: z.string().url().optional(),
  /** The model's context window in tokens (shown as the "window" in the chat UI). */
  AI_CONTEXT_TOKENS: z.coerce.number().int().positive().default(128000),
  DATABASE_URL: z.string().min(1),
})

export const env = envSchema.parse(process.env)
