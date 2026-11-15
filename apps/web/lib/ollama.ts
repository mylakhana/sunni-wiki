/**
 * Local Ollama client. Runs entirely in the user's browser and talks straight to the Ollama
 * server on THEIR machine (default http://localhost:11434): nothing goes through our servers.
 * The browser needs permission: start Ollama with OLLAMA_ORIGINS set to this site's origin (or "*").
 */
import { tokensOf } from "@/lib/ai-context"

export const OLLAMA_URL = "http://localhost:11434"

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string }
export type OllamaUsage = { promptTokens: number; outputTokens: number }

export class OllamaError extends Error {}

const CORS_HELP = "Could not reach Ollama. Make sure it is running (`ollama serve`) and allows this site: start it with OLLAMA_ORIGINS=\"" + "<this site's origin>" + "\" (or \"*\")."

/** Estimated tokens for each part of the prompt (chars / CHARS_PER_TOKEN; real counts arrive after the reply). */
export function estimateBreakdown(system: string, context: string, history: ChatMsg[], question: string) {
  const parts = {
    system: tokensOf(system.length),
    context: tokensOf(context.length),
    history: tokensOf(history.reduce((n, m) => n + m.content.length, 0)),
    question: tokensOf(question.length),
  }
  return { ...parts, total: parts.system + parts.context + parts.history + parts.question }
}

/**
 * The num_ctx we send. Ollama's default is 4096 and it silently truncates the START of the prompt (our context), so we always set it.
 * Fixed at the user's cap (so the window stays stable), only raised when the prompt would not fit, and never above the model's own maximum.
 */
export function effectiveCtx(promptTokens: number, cap: number, modelMax: number | null) {
  const needed = Math.ceil((promptTokens * 1.1 + 2048) / 1024) * 1024
  return Math.min(modelMax ?? 1_048_576, Math.max(cap, needed))
}

/** The model's real maximum context length (tokens) from Ollama, or null if unknown (model not pulled / server unreachable). */
export async function getModelContext(model: string, signal?: AbortSignal): Promise<number | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/show`, { method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ model }) })
    if (!res.ok) return null
    const info = ((await res.json()) as { model_info?: Record<string, unknown> }).model_info ?? {}
    const key = Object.keys(info).find((k) => k.endsWith(".context_length"))
    const n = key ? Number(info[key]) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  } catch { return null }
}

type Chunk = { message?: { content?: string; thinking?: string }; done?: boolean; prompt_eval_count?: number; eval_count?: number; error?: string }

/**
 * Streams one reply, from the user's local Ollama (`local`) or from the server-configured provider (same-origin /api/ai/chat).
 * Both speak the same NDJSON shape. Calls onThinking / onContent with each new piece of text; resolves with the real token counts.
 */
export async function streamChat(opts: {
  local: boolean
  model: string
  think: boolean
  messages: ChatMsg[]
  numCtx: number
  signal: AbortSignal
  onThinking: (t: string) => void
  onContent: (t: string) => void
}): Promise<OllamaUsage> {
  let res: Response
  try {
    res = opts.local
      ? await fetch(`${OLLAMA_URL}/api/chat`, {
          method: "POST",
          signal: opts.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: opts.model, messages: opts.messages, stream: true, think: opts.think, options: { num_ctx: opts.numCtx } }),
        })
      : await fetch("/api/ai/chat", { method: "POST", signal: opts.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: opts.messages }) })
  } catch (e) {
    if (opts.signal.aborted) throw e
    throw new OllamaError(opts.local ? CORS_HELP.replace("<this site's origin>", location.origin) : "Could not reach the server.")
  }
  if (!res.ok || !res.body) {
    let msg = opts.local ? `Ollama returned HTTP ${res.status}` : `AI request failed (HTTP ${res.status})`
    try { const j = (await res.json()) as { error?: string; message?: string }; if (j.message ?? j.error) msg = (j.message ?? j.error)! } catch {}
    if (opts.local && res.status === 404) msg += ` — is the model pulled? Try: ollama pull ${opts.model}`
    throw new OllamaError(msg)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  let usage: OllamaUsage = { promptTokens: 0, outputTokens: 0 }
  const handle = (line: string) => {
    if (!line.trim()) return
    const c = JSON.parse(line) as Chunk
    if (c.error) throw new OllamaError(c.error)
    if (c.message?.thinking) opts.onThinking(c.message.thinking)
    if (c.message?.content) opts.onContent(c.message.content)
    if (c.done) usage = { promptTokens: c.prompt_eval_count ?? 0, outputTokens: c.eval_count ?? 0 }
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    lines.forEach(handle)
  }
  handle(buf)
  return usage
}
