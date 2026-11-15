"use client"

/**
 * SunniWiki AI chat panel, backed by the user's own local Ollama (browser -> localhost, nothing touches our servers).
 * Streams the reply, shows the model's thinking like ChatGPT, estimates token usage, renders Markdown.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { fmt, tokensOf, type BuiltContext } from "@/lib/ai-context"
import { effectiveCtx, estimateBreakdown, getModelContext, OllamaError, streamChat, type ChatMsg, type OllamaUsage } from "@/lib/ollama"
import { ChatMarkdown } from "./chat-markdown"
import { usePref } from "./use-pref"

type Msg = { role: "user" | "ai"; text: string; thinking?: string; thinkSecs?: number; usage?: OllamaUsage; error?: string }
type Settings = { local: boolean; model: string; think: boolean; winK: number } // winK: max window in K tokens

const btn = "h-9 rounded-full px-4 text-sm font-medium"
const DEFAULTS: Settings = { local: false, model: "", think: false, winK: 10 }

/** ChatGPT-style reasoning block: open and shimmering while the model thinks, then collapsed to "Thought for N s". */
function Thinking({ text, live, secs }: { text: string; live: boolean; secs?: number }) {
  const [open, setOpen] = useState(false)
  const shown = open
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={shown} className="c-muted flex items-center gap-1.5 font-medium">
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24" className={`transition ${shown ? "rotate-90" : ""}`} aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        <span className={live ? "animate-pulse" : ""}>{live ? "Thinking…" : `Thought for ${secs ?? 0}s`}</span>
      </button>
      {shown && <div className="bd-line c-muted mt-1.5 max-h-60 overflow-y-auto border-s-2 ps-3 whitespace-pre-wrap" dir="auto">{text}</div>}
    </div>
  )
}

/** One line: total tokens used by the conversation (system prompt + context + history + question) and its share of the context window. */
/** ⋮ menu: clear history + switch between the server AI (default) and the user's local Ollama. */
function ChatMenu({ local, busy, canClear, onClear, onToggleLocal }: { local: boolean; busy: boolean; canClear: boolean; onClear: () => void; onToggleLocal: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key)
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key) }
  }, [open])
  const item = "block w-full px-3 py-2 text-left text-sm hover:bg-(--lib-accent-soft) disabled:opacity-40 disabled:hover:bg-transparent"
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Chat options" className="c-muted grid h-9 w-9 place-items-center rounded-full" style={{ background: "var(--lib-line)" }}>
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 z-10 mt-1 w-56 overflow-hidden py-1" style={{ border: "1px solid var(--lib-line)" }}>
          <button role="menuitem" className={item} disabled={!canClear || busy} onClick={() => { onClear(); setOpen(false) }}>Clear history</button>
          <button role="menuitem" className={item} disabled={busy} onClick={() => { onToggleLocal(); setOpen(false) }}>{local ? "Use SunniWiki AI (default)" : "Use local AI (Ollama)"}</button>
        </div>
      )}
    </div>
  )
}

function TokenBar({ total, window }: { total: number; window: number }) {
  const pct = Math.min(100, (total / window) * 100)
  return (
    <div className="bd-line border-t px-3 pt-2 text-[11px]" aria-label="Token usage">
      <div className="c-muted num flex justify-between gap-2">
        <span>{fmt(total)} tokens</span>
        <span>{pct < 1 && total > 0 ? "<1" : Math.round(pct)}% of {fmt(window)} window</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--lib-line)" }}>
        <div className={pct > 90 ? "h-full bg-red-600" : "bg-lib-accent h-full"} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function AskAiChat({ count, ctx, storageKey, onExit }: { count: number; ctx: BuiltContext; storageKey: string; onExit: () => void }) {
  const [settings, setSettings] = usePref<Settings>("ollama", DEFAULTS)
  // server AI (configured in apps/api/.env) is the default; `local` overrides it with the user's own Ollama
  const [server, setServer] = useState<{ configured: boolean; provider: string; model: string; contextTokens: number } | null>(null)
  useEffect(() => { void fetch("/api/ai/config").then((r) => r.json()).then((j: { data: NonNullable<typeof server> }) => setServer(j.data)).catch(() => setServer({ configured: false, provider: "", model: "", contextTokens: 0 })) }, [])
  const [modelDraft, setModelDraft] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) ?? "[]") as Msg[] } catch { return [] }
  })
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<"thinking" | "answering">("thinking")
  const abort = useRef<AbortController | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true) // follow the stream unless the user scrolled up

  useEffect(() => { if (!busy) try { sessionStorage.setItem(storageKey, JSON.stringify(msgs)) } catch {} }, [storageKey, msgs, busy])
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => { const el = scroller.current; if (el && stick.current) el.scrollTop = el.scrollHeight }, [msgs])

  const model = modelDraft ?? settings.model
  // the model's real context length, looked up whenever the saved model name changes
  const [modelMax, setModelMax] = useState<number | null>(null)
  useEffect(() => {
    if (!settings.model) { setModelMax(null); return }
    const ac = new AbortController()
    void getModelContext(settings.model, ac.signal).then((n) => { if (!ac.signal.aborted) setModelMax(n) })
    return () => ac.abort()
  }, [settings.model])
  const history = useMemo<ChatMsg[]>(() => msgs.filter((m) => !m.error).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text })), [msgs])
  const sysChars = ctx.system.length
  const est = useMemo(() => estimateBreakdown(ctx.system, ctx.text.slice(sysChars), history, draft), [ctx, sysChars, history, draft])
  // after a reply: Ollama's real count for the whole exchange (prompt incl. context + reply) plus whatever is typed now; before: the estimate
  const lastReply = [...msgs].reverse().find((m) => m.usage?.promptTokens)
  const total = lastReply?.usage ? lastReply.usage.promptTokens + lastReply.usage.outputTokens + tokensOf(draft.length) : est.total
  const local = settings.local
  const cap = Math.max(4, settings.winK) * 1024
  const window = local ? effectiveCtx(total, cap, modelMax) : server?.contextTokens || 128_000
  const noServer = !local && server !== null && !server.configured

  const patchLast = (f: (m: Msg) => Msg) => setMsgs((all) => all.map((m, i) => (i === all.length - 1 ? f(m) : m)))

  const send = async () => {
    const text = draft.trim()
    const name = model.trim()
    if (!text || busy || noServer || (!local && !server)) return
    if (local && !name) { setModelDraft(""); document.getElementById("ollama-model")?.focus(); return }
    if (local) { setSettings({ ...settings, model: name }); setModelDraft(null) }
    const messages: ChatMsg[] = [{ role: "system", content: ctx.text }, ...history, { role: "user", content: text }]
    const ac = new AbortController()
    abort.current = ac
    stick.current = true
    setMsgs((m) => [...m, { role: "user", text }, { role: "ai", text: "" }])
    setDraft(""); setBusy(true); setPhase("thinking")
    const t0 = Date.now()
    let thinkEnd = 0
    const numCtx = local ? effectiveCtx(estimateBreakdown(ctx.system, ctx.text.slice(sysChars), history, text).total, cap, modelMax) : window
    try {
      const usage = await streamChat({
        local, model: name, think: settings.think, messages, numCtx, signal: ac.signal,
        onThinking: (t) => patchLast((m) => ({ ...m, thinking: (m.thinking ?? "") + t })),
        onContent: (t) => { if (!thinkEnd) { thinkEnd = Date.now(); setPhase("answering") } patchLast((m) => ({ ...m, text: m.text + t })) },
      })
      patchLast((m) => ({ ...m, usage, thinkSecs: m.thinking ? Math.max(1, Math.round(((thinkEnd || Date.now()) - t0) / 1000)) : undefined }))
    } catch (e) {
      if (ac.signal.aborted) patchLast((m) => ({ ...m, thinkSecs: m.thinking ? Math.round((Date.now() - t0) / 1000) : undefined }))
      else patchLast((m) => ({ ...m, error: e instanceof OllamaError ? e.message : "Something went wrong talking to Ollama." }))
    } finally { setBusy(false); abort.current = null }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="bd-line flex items-center justify-between gap-2 border-b p-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold"><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4l1.8 4.7L15.5 10.5l-4.7 1.8L9 17l-1.8-4.7L2.5 10.5l4.7-1.8L9 4zM18 3v4M16 5h4M18 15v4M16 17h4" /></svg> SunniWiki AI</h2>
          <p className="c-muted text-[11px]">{count} items as context · ~{fmt(ctx.tokens)} tokens</p>
        </div>
        <ChatMenu local={local} busy={busy} canClear={msgs.length > 0} onClear={() => setMsgs([])} onToggleLocal={() => setSettings({ ...settings, local: !local })} />
      </div>

      {!local && <p className="bd-line c-muted border-b px-3 py-2 text-[11px]" aria-label="AI settings">{server?.configured ? `${server.provider} | ${server.model}` : server ? "Server AI is not configured" : "…"}</p>}
      {local && <div className="bd-line space-y-2 border-b px-3 py-2" aria-label="Ollama settings">
        <label className="flex items-center gap-2 text-[11px]">
          <span className="c-muted shrink-0">Ollama model</span>
          <input id="ollama-model" value={model} onChange={(e) => setModelDraft(e.target.value)} onBlur={() => { setSettings({ ...settings, model: model.trim() }); setModelDraft(null) }}
            disabled={busy} placeholder="e.g. qwen3:8b" spellCheck={false} autoCapitalize="off" className="bg-lib-bg min-w-0 flex-1 rounded-lg px-2 py-1 text-xs outline-none" />
        </label>
        <div className="flex items-center justify-between gap-3">
        <label className="flex shrink-0 items-center gap-1 text-[11px]" title="Max context window sent to Ollama (limited by the model). Bigger = more RAM.">
          <span className="c-muted">Window</span>
          <input type="number" min={4} max={1024} step={4} value={settings.winK} disabled={busy} onChange={(e) => setSettings({ ...settings, winK: Math.max(4, Math.round(Number(e.target.value) || 10)) })} className="bg-lib-bg num w-12 rounded-lg px-1.5 py-1 text-xs outline-none" aria-label="Max context window in thousands of tokens" />
          <span className="c-muted">K</span>
        </label>
        <button type="button" role="switch" aria-checked={settings.think} disabled={busy} onClick={() => setSettings({ ...settings, think: !settings.think })} className="flex shrink-0 items-center gap-1.5 text-[11px]">
          <span className="c-muted">Thinking</span>
          <span className={`relative h-5 w-9 rounded-full transition-colors ${settings.think ? "bg-lib-accent" : "bg-(--lib-line)"}`}>
            <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${settings.think ? "translate-x-4" : ""}`} />
          </span>
        </button>
        </div>
      </div>}

      <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60 }} className="flex-1 space-y-3 overflow-y-auto p-3">
        {msgs.length === 0 && (
          <p className="c-muted rounded-xl p-3 text-xs leading-relaxed" style={{ background: "var(--lib-line)" }}>
            {local ? <>
              Runs on <strong>your own computer</strong> with Ollama: nothing is sent to our servers. Start Ollama, type a model you have pulled (e.g. <code>qwen3:8b</code>), then ask your first question.
              If the browser blocks the connection, start Ollama with <code>OLLAMA_ORIGINS=&quot;{typeof location !== "undefined" ? location.origin : "*"}&quot;</code>.
            </> : noServer
              ? <>The server has no AI key configured. Open the <strong>⋮</strong> menu and choose <strong>Use local AI (Ollama)</strong> to chat with a model on your own computer.</>
              : <>Your context is loaded. Nothing has been sent yet — ask your first question below. Want to keep it on your machine? Use <strong>⋮ → Use local AI (Ollama)</strong>.</>}
          </p>
        )}
        {msgs.map((m, i) => {
          const last = i === msgs.length - 1
          const live = busy && last
          if (m.role === "user") return <div key={i} className="bg-lib-accent ml-auto max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-white" dir="auto">{m.text}</div>
          return (
            <div key={i} className="space-y-2 text-sm">
              {m.thinking && <div className="px-1"><Thinking text={m.thinking} live={live && phase === "thinking"} secs={m.thinkSecs} /></div>}
              {(m.text || m.error || m.usage || (live && !m.thinking)) && (
                <div className="rounded-2xl px-3 py-2" style={{ background: "var(--lib-line)" }}>
                  {live && !m.text && !m.thinking && <p className="c-muted animate-pulse text-xs" role="status">{local && !settings.think ? "Loading model…" : "Thinking…"}</p>}
                  {m.text && <ChatMarkdown md={m.text} />}
                  {m.error && <p className="text-xs text-red-600" role="alert">{m.error}</p>}
                  {m.usage && m.usage.promptTokens > 0 && <p className="c-muted num mt-2 text-[10px]">{fmt(m.usage.promptTokens)} in · {fmt(m.usage.outputTokens)} out tokens</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <TokenBar total={total} window={window} />
      <form onSubmit={(e) => { e.preventDefault(); void send() }} className="flex items-end gap-2 p-3 pt-2">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }}
          rows={2} placeholder="Ask about the selected texts…" aria-label="Message" className="bg-lib-bg min-h-10 flex-1 resize-none rounded-xl px-3 py-2 text-sm outline-none" />
        {busy
          ? <button type="button" onClick={() => abort.current?.abort()} className={`${btn} bg-red-600 text-white`}>Stop</button>
          : <button type="submit" disabled={!draft.trim() || noServer} className={`${btn} bg-lib-accent text-white disabled:opacity-40`}>Send</button>}
      </form>
    </div>
  )
}
