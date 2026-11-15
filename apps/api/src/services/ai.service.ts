import { env } from "../config/env.js"

/** OpenAI-compatible providers. Add a preset here and to the AI_PROVIDER enum in config/env.ts. */
const PROVIDERS = {
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com" },
} as const

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export function aiConfig() {
  const p = PROVIDERS[env.AI_PROVIDER]
  return {
    configured: Boolean(env.AI_API_KEY),
    provider: p.label,
    model: env.AI_MODEL,
    contextTokens: env.AI_CONTEXT_TOKENS,
  }
}

export class AiUpstreamError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message)
  }
}

/** One line of the normalized stream (same shape the web client already reads from Ollama). */
export type AiChunk = {
  message?: { content?: string; thinking?: string }
  done?: boolean
  prompt_eval_count?: number
  eval_count?: number
  error?: string
}

type Delta = { choices?: { delta?: { content?: string | null; reasoning_content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } | null; error?: { message?: string } }

/**
 * Calls the provider's /chat/completions with stream=true and yields normalized chunks.
 * Throws AiUpstreamError (before any chunk) when the provider rejects the request.
 */
export async function* streamAiChat(messages: ChatMessage[], signal: AbortSignal): AsyncGenerator<AiChunk> {
  if (!env.AI_API_KEY) throw new AiUpstreamError("AI is not configured on the server", 503)
  const base = (env.AI_BASE_URL ?? PROVIDERS[env.AI_PROVIDER].baseUrl).replace(/\/+$/, "")
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${env.AI_API_KEY}` },
    body: JSON.stringify({ model: env.AI_MODEL, messages, stream: true, stream_options: { include_usage: true } }),
  }).catch(() => {
    throw new AiUpstreamError("Could not reach the AI provider")
  })
  if (!res.ok || !res.body) {
    let msg = `AI provider returned HTTP ${res.status}`
    try {
      const j = (await res.json()) as Delta
      if (j.error?.message) msg = j.error.message
    } catch {}
    throw new AiUpstreamError(msg)
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  let usage = { prompt: 0, output: 0 }
  const parse = (line: string): AiChunk | null => {
    const l = line.trim()
    if (!l.startsWith("data:")) return null // blank lines and ": keep-alive" comments
    const data = l.slice(5).trim()
    if (!data || data === "[DONE]") return null
    const d = JSON.parse(data) as Delta
    if (d.error?.message) return { error: d.error.message }
    if (d.usage) usage = { prompt: d.usage.prompt_tokens ?? 0, output: d.usage.completion_tokens ?? 0 }
    const delta = d.choices?.[0]?.delta
    const content = delta?.content ?? undefined
    const thinking = delta?.reasoning_content ?? undefined
    return content || thinking ? { message: { content, thinking } } : null
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const line of lines) {
      const c = parse(line)
      if (c) yield c
    }
  }
  const tail = parse(buf)
  if (tail) yield tail
  yield { done: true, prompt_eval_count: usage.prompt, eval_count: usage.output }
}
