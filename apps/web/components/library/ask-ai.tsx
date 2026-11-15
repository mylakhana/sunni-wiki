"use client"

/**
 * Ask AI about this. Real: context picker (lazy contents tree in selection mode), Markdown fetch + IndexedDB cache,
 * context view (rendered from buildContext), URL/session restore. The chat itself lives in ask-ai-chat.tsx (local Ollama).
 * Flow: pick context (left panel) -> fetch + cache -> chat panel (right) + context view (main).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AI_MAX_CHARS, buildContext, fmt, loadContext, tokensOf, type BuiltContext, type Target, type UnitStatus } from "@/lib/ai-context"
import { getMany, prune, type CachedUnit } from "@/lib/ai-context-cache"
import { titleOf, type Volume } from "@/lib/types"
import { Markdown } from "./ask-ai-markdown"
import { ChapterBrowser } from "./chapter-browser"
import { useContextSelection } from "./context-select"

const btn = "h-9 rounded-full px-4 text-sm font-medium"
const SPARKLE = <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4l1.8 4.7L15.5 10.5l-4.7 1.8L9 17l-1.8-4.7L2.5 10.5l4.7-1.8L9 4zM18 3v4M16 5h4M18 15v4M16 17h4" /></svg>

/** Fetch + cache state for a list of units (shared by the picker's Continue and by restoring a shared link / refresh). */
function useContextLoader(book: string) {
  const [status, setStatus] = useState<Record<string, UnitStatus>>({})
  const entries = useRef(new Map<string, CachedUnit>())
  const ctl = useRef<AbortController | null>(null)
  useEffect(() => () => ctl.current?.abort(), [])
  const run = useCallback((targets: Target[]) => {
    if (!ctl.current || ctl.current.signal.aborted) ctl.current = new AbortController()
    return loadContext(book, targets, {
      signal: ctl.current.signal,
      onStatus: (id, s, unit) => { if (unit) entries.current.set(id, unit); setStatus((o) => ({ ...o, [id]: s })) },
    })
  }, [book])
  return { status, entries, run }
}

/** Real progress bar + a Retry button for every failed chapter. */
function LoadProgress({ label, targets, status, onRetry }: { label: string; targets: Target[]; status: Record<string, UnitStatus>; onRetry: (t: Target) => void }) {
  const done = targets.filter((t) => status[t.id] === "done" || status[t.id] === "missing").length
  const failed = targets.filter((t) => status[t.id] === "error")
  return (
    <div role="status">
      <p className="text-sm font-medium">{label} {done} / {targets.length}…</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--lib-line)" }}>
        <div className="bg-lib-accent h-full transition-all" style={{ width: `${targets.length ? (done / targets.length) * 100 : 0}%` }} />
      </div>
      {failed.length > 0 && (
        <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto" role="alert">
          {failed.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-red-600">Failed: {t.title ?? `item ${t.id}`}</span>
              <button onClick={() => onRetry(t)} className="c-accent shrink-0 font-medium">Retry</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Left panel while choosing context. */
export function AskAiPicker({ book, volumes, active, openVolume, openPath, onCancel, onProceed }: { book: string; volumes: Volume[]; active?: string; openVolume?: string | null; openPath?: string[]; onCancel: () => void; onProceed: (ids: string[]) => void }) {
  const [targets, setTargets] = useState<Target[] | null>(null) // non-null = fetching
  const sel = useContextSelection(book, targets !== null)
  const loader = useContextLoader(book)
  const { units, chars } = sel
  const cap = sel.api.cap
  const over = chars > cap

  const start = () => {
    const t = units.map((u) => ({ id: u.id, slug: u.slug, title: titleOf(u) }))
    setTargets(t)
    void loader.run(t)
  }
  useEffect(() => {
    if (targets && targets.length && targets.every((t) => loader.status[t.id] === "done")) {
      void prune(targets.map((t) => t.id))
      onProceed(targets.map((t) => t.id))
    }
  }, [targets, loader.status, onProceed])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 p-3 pb-0">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">{SPARKLE} Choose context for AI</h2>
        <button onClick={onCancel} className="c-muted h-9 w-9 rounded-full" style={{ background: "var(--lib-line)" }} aria-label="Cancel SunniWiki AI">✕</button>
      </div>
      <div className="relative flex-1 overflow-y-auto p-3">
        <p className="c-muted mb-3 rounded-xl p-3 text-xs leading-relaxed" style={{ background: "var(--lib-accent-soft)" }}>
          Select the chapters or topics that the AI should know about.
        </p>
        <ChapterBrowser book={book} volumes={volumes} active={active} openVolume={openVolume} openPath={openPath} select={sel.api} />
      </div>

      <div className="bd-line border-t p-3">
        {targets ? (
          <LoadProgress label="Fetching & caching" targets={targets} status={loader.status} onRetry={(t) => void loader.run([t])} />
        ) : (
          <div className="space-y-2">
            {over && <p className="text-xs text-red-600" role="alert">Too large for the AI: the limit is {fmt(cap)} chars (~{fmt(tokensOf(cap))} tokens). Deselect some items.</p>}
            <div className="flex items-center justify-between gap-3">
              <p className="c-muted num text-xs">{units.length ? `${units.length} selected · ${fmt(chars)} chars · ~${fmt(tokensOf(chars))} tokens` : "Nothing selected"}{sel.resolving && " · resolving…"}</p>
              <button onClick={start} disabled={!units.length || over || sel.resolving} className={`${btn} bg-lib-accent text-(--lib-bg) disabled:opacity-40`}>Continue</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Main column in chat mode: system prompt + every cached context item, rendered from buildContext (view == payload).
 * `fresh`: the picker just fetched everything, so use the cache as is; otherwise (refresh / shared link) revalidate everything with a progress state.
 * `onResolved` reports the ids that really exist (404s dropped) once the context is ready.
 */
export function AskAiContext({ book, authorPrompt, ids, fresh, onExit, onResolved, onContext }: { book: string; authorPrompt?: string | null; ids: string[]; fresh: boolean; onExit: () => void; onResolved: (ids: string[]) => void; onContext: (ctx: BuiltContext) => void }) {
  const [units, setUnits] = useState<CachedUnit[] | null>(null)
  const targets = useMemo<Target[]>(() => ids.map((id) => ({ id })), [ids])
  const loader = useContextLoader(book)
  const started = useRef(false)
  const reported = useRef(false)
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const cached = await getMany(ids)
      setNames(Object.fromEntries([...cached].map(([id, u]) => [id, titleOf(u.title)])))
      if (fresh && ids.every((id) => cached.has(id))) { ids.forEach((id) => loader.entries.current.set(id, cached.get(id)!)); finish(ids); return }
      await loader.run(ids.map((id) => ({ id, slug: cached.get(id)?.slug })))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, [])

  function finish(valid: string[]) {
    if (reported.current) return
    reported.current = true
    setUnits(valid.map((id) => loader.entries.current.get(id)!))
    onResolved(valid)
  }
  useEffect(() => {
    if (reported.current || !ids.every((id) => loader.status[id] === "done" || loader.status[id] === "missing")) return
    finish(ids.filter((id) => loader.status[id] === "done"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loader.status])

  const ctx = useMemo(() => (units ? buildContext(units, authorPrompt) : null), [units, authorPrompt])
  useEffect(() => { if (ctx) onContext(ctx) }, [ctx, onContext])
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null)
  const copyAll = async () => {
    if (!ctx) return
    try { await navigator.clipboard.writeText(ctx.text); setCopied("ok") } catch { setCopied("fail") }
    setTimeout(() => setCopied(null), 2500)
  }
  const exitRow = (text: string, sub?: string, withCopy?: boolean) => (
    <div className="card flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between" style={{ background: "color-mix(in srgb, #ef4444 14%, var(--lib-surface))" }}>
      <div><p className="c-muted text-xs">{text}</p>{sub && <p className="c-muted num text-[11px]">{sub}</p>}</div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {withCopy && <button onClick={() => void copyAll()} title="Copy the system prompt and all selected texts, to paste into any other AI" className="rounded-full bg-lib-bg px-3 py-1.5 text-xs font-medium hover:opacity-80">{copied === "ok" ? "Copied ✓" : copied === "fail" ? "Copy failed" : "Copy context"}</button>}
      <button onClick={onExit} className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">End AI chat</button>
      </div>
    </div>
  )

  if (!units || !ctx) {
    const shown = targets.map((t) => ({ ...t, title: names[t.id] }))
    return (
      <div className="space-y-4">
        {exitRow("AI context")}
        <div className="card px-5 py-4">
          <LoadProgress label="Restoring AI context" targets={shown} status={loader.status} onRetry={(t) => void loader.run([{ id: t.id, slug: t.slug }])} />
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {exitRow(`AI context · ${units.length} item${units.length === 1 ? "" : "s"} selected`, `${fmt(ctx.chars)} chars · ~${fmt(ctx.tokens)} tokens sent as context`, true)}
      <details className="card group px-5 py-4" style={{ borderStyle: "dashed" }}>
        <summary className="c-gold flex cursor-pointer list-none items-center justify-between text-xs font-semibold tracking-[.12em] uppercase">
          System prompt
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" className="transition group-open:rotate-90" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </summary>
        <p className="mt-3 max-h-96 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap">{ctx.system}</p>
      </details>
      {ctx.sections.map((sec) => (
        <article key={sec.id} className="card px-5 py-6 sm:px-8" data-context-section={sec.id}>
          <h2 className="c-gold text-xs font-semibold tracking-[.12em] uppercase" dir="auto">{sec.header}</h2>
          <p className="c-muted num mb-3 text-[11px]">{fmt(sec.markdown.length)} chars</p>
          <Markdown md={sec.markdown} prefix={`u${sec.id}`} />
        </article>
      ))}
    </div>
  )
}
