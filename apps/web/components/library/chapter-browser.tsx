"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { loadChapterLevel } from "@/lib/actions"
import type { ChapterItem, Volume } from "@/lib/types"
import { titleOf } from "@/lib/types"
import { ChapterTitles } from "./chapter-titles"
import { CheckBox, chapterKey, unitOf, volumeKey, type SelectApi } from "./context-select"
import { usePref } from "./use-pref"
import { fmt } from "@/lib/ai-context"

type Level = { items: ChapterItem[] } | { error: true }
/** `select`: selection mode (Ask AI context picker): rows get tri-state checkboxes instead of links. */
type Ctx = { book: string; filter: string; topics: boolean; active?: string; openPath: string[]; select?: SelectApi }

/** Levels already fetched in this browser session (the server also caches them). */
const levels = new Map<string, ChapterItem[]>()

const norm = (s: string) => s.toLowerCase()
const matches = (c: ChapterItem, f: string) => !f || [c.en, c.ar, c.ur].some((t) => t && norm(t).includes(f))
/** `rtl`: the title reads right-to-left (Arabic / Urdu), so the collapsed chevron points left. */
const chev = (open: boolean, rtl = false) => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" className={`transition ${open ? "rotate-90" : rtl ? "rotate-180" : ""}`}><path d="m9 6 6 6-6 6" /></svg>
)

/** One level of the contents tree; fetched when first rendered. */
/** `only`: show just these levels (a booklet lists its chapters, not the sub-topic anchors of its intro). */
function ChapterLevel({ ctx, volume, parent, trail, quiet = false, only, onEmpty }: { ctx: Ctx; volume: string | null; parent: string | null; trail: string[]; quiet?: boolean; only?: number[]; onEmpty?: () => void }) {
  const key = `${ctx.book}|${volume ?? ""}|${parent ?? ""}`
  const [res, setRes] = useState<Level | "loading">(() => (levels.has(key) ? { items: levels.get(key)! } : "loading"))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (levels.has(key)) return
    let live = true
    loadChapterLevel(ctx.book, volume, parent)
      .then((r) => {
        if ("items" in r) levels.set(key, r.items)
        if (live) setRes(r)
      })
      .catch(() => live && setRes({ error: true }))
    return () => { live = false }
  }, [key, ctx.book, volume, parent, attempt])

  const loaded = res !== "loading" && "items" in res
  const nothing = loaded && !(only ? res.items.filter((c) => only.includes(c.level)) : res.items).some((c) => ctx.topics || c.level <= 1)
  useEffect(() => { if (nothing) onEmpty?.() }, [nothing, onEmpty])
  if (res === "loading") return <p className="c-muted px-3 py-2 text-xs" role="status">Loading…</p>
  if ("error" in res) {
    return (
      <p className="px-3 py-2 text-xs" role="alert">
        Could not load chapters.{" "}
        <button className="c-accent font-medium" onClick={() => { setRes("loading"); setAttempt((a) => a + 1) }}>Try again</button>
      </p>
    )
  }
  const byLevel = only ? res.items.filter((c) => only.includes(c.level)) : res.items
  const shown = ctx.topics ? byLevel : byLevel.filter((c) => c.level <= 1) // topics (level 2+) are hidden when "Show Topics" is off
  const items = shown.filter((c) => c.level === 0 || matches(c, ctx.filter)) // groups stay so their chapters can be filtered
  if (quiet && (!shown.length || !items.length)) return null
  if (!shown.length) return <p className="c-muted px-3 py-2 text-xs">No chapters yet.</p>
  if (!items.length) return <p className="c-muted px-3 py-2 text-xs">No chapter titles match.</p>
  return <ul className="space-y-0.5">{items.map((c) => <ChapterNode key={c.id} ctx={ctx} item={c} trail={trail} />)}</ul>
}

/** Selection mode: checkbox + titles (+ size / note) in place of a link. Level 3 anchors are read-only. */
function SelectLabel({ ctx, item, trail }: { ctx: Ctx; item: ChapterItem; trail: string[] }) {
  const s = ctx.select!
  const key = chapterKey(item.id)
  const unit = unitOf(item)
  const state = s.stateOf(key, trail, unit)
  const need = s.needsResolve(key, trail, unit)
  useEffect(() => { if (need) s.resolve(key) }, [need, key, s])
  if (item.level === 3) {
    return <div className="min-w-0 flex-1 py-2 pr-3"><ChapterTitles t={item} /><span className="c-muted block text-[11px]">included in chapter</span></div>
  }
  const size = unit ? unit.chars : item.subtreeChars
  const note = size != null && size > s.cap ? undefined : s.note(key) // the size line already says "too large"
  const noText = item.level === 2 && item.chars === 0
  const tooBig = size != null && size > s.cap
  const off = s.locked || noText || tooBig
  const line = noText ? "No text" : tooBig ? (item.level === 2 ? "Too large for AI" : "Too large to select at once — pick items inside") : size != null ? `${fmt(size)} chars` : null
  return (
    <label className={`flex min-w-0 flex-1 items-start gap-2 py-2 pr-3 ${off ? "opacity-60" : "cursor-pointer"}`}>
      <input type="checkbox" className="sr-only" checked={state === "all"} disabled={off} onChange={() => s.toggle(key, trail, unit)} />
      <span className="mt-0.5"><CheckBox state={state} busy={s.busy(key)} /></span>
      <span className="min-w-0 flex-1">
        <ChapterTitles t={item} />
        {line && <span className="c-muted block text-[11px] tabular-nums">{line}</span>}
        {note && <span className="block text-[11px] text-red-600" role="alert">{note}</span>}
      </span>
    </label>
  )
}

/** Level 0 (e.g. "Book of Prayer"): a grouping title above its booklets / chapters. Not a link, not collapsible. */
function GroupNode({ ctx, item, trail }: { ctx: Ctx; item: ChapterItem; trail: string[] }) {
  return (
    <li className="pt-2">
      {ctx.select ? (
        <div className="flex px-1" data-group={item.slug}><SelectLabel ctx={ctx} item={item} trail={trail} /></div>
      ) : (
        <div className="c-gold px-3 pt-1 pb-1 [&_div]:font-semibold" data-group={item.slug}>
          <ChapterTitles t={item} />
        </div>
      )}
      <div className="border-lib-line ml-3 border-l pl-1">
        <ChapterLevel ctx={ctx} volume={null} parent={item.id} trail={[...trail, chapterKey(item.id)]} quiet />
      </div>
    </li>
  )
}

function ChapterNode({ ctx, item, trail }: { ctx: Ctx; item: ChapterItem; trail: string[] }) {
  const [open, setOpen] = useState(() => ctx.openPath.includes(item.id))
  const [empty, setEmpty] = useState(false) // discovered at runtime: expanded, yet the level has nothing to show
  const markEmpty = useCallback(() => { setEmpty(true); setOpen(false) }, [])
  const wantOpen = ctx.openPath.includes(item.id)
  // the shell persists across chapters: open the ancestors of the newly shown chapter
  useEffect(() => { if (wantOpen) setOpen(true) }, [wantOpen])
  if (item.level === 0) return <GroupNode ctx={ctx} item={item} trail={trail} />
  const isActive = item.slug === ctx.active
  // children of a booklet / chapter are all topics-level (2+), which are hidden when "Show Topics" is off: nothing to expand then
  const expandable = item.hasChildren && ctx.topics && !empty
  return (
    <li>
      {/* a booklet (level 1) is a tile: the link opens it, only the chevron expands its chapters */}
      <div className={`side-item flex items-start gap-1 rounded-xl ${item.level === 1 ? "bd-line border" : ""} ${isActive ? "active" : ""}`} data-nav={item.slug}>
        {expandable ? (
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${titleOf(item)}`}
            className="c-muted mt-2 grid h-8 w-8 shrink-0 place-items-center rounded-full">{chev(open, !!(item.ar || item.ur))}</button>
        ) : <span className="w-2 shrink-0" />}
        {ctx.select ? <SelectLabel ctx={ctx} item={item} trail={trail} /> : (
          <Link href={`/books/${encodeURIComponent(ctx.book)}/${encodeURIComponent(item.slug)}`} aria-current={isActive ? "page" : undefined} className="min-w-0 flex-1 py-2 pr-3">
            <ChapterTitles t={item} />
          </Link>
        )}
      </div>
      {open && expandable && (
        <div className="border-lib-line ml-4 border-l pl-1">
          <ChapterLevel ctx={ctx} volume={null} parent={item.id} trail={[...trail, chapterKey(item.id)]} only={item.level === 1 ? [2] : undefined} onEmpty={markEmpty} />
        </div>
      )}
    </li>
  )
}

/** Selection mode: tick a whole volume (resolved to its units; a clear message when it exceeds the AI cap). */
function VolumeCheck({ ctx, volume }: { ctx: Ctx; volume: Volume }) {
  const s = ctx.select!
  const key = volumeKey(volume.slug)
  const state = s.stateOf(key, [], null)
  return (
    <label className={`flex h-12 shrink-0 items-center pl-3 ${s.locked ? "opacity-60" : "cursor-pointer"}`} title="Select the whole volume">
      <input type="checkbox" className="sr-only" checked={state === "all"} disabled={s.locked} onChange={() => s.toggle(key, [], null)} aria-label={`Select ${volume.en || volume.ar || volume.ur || `volume ${volume.sort}`}`} />
      <CheckBox state={state} busy={s.busy(key)} />
    </label>
  )
}

function VolumeSection({ ctx, volume, open, onToggle }: { ctx: Ctx; volume: Volume; open: boolean; onToggle: () => void }) {
  const count = ctx.topics ? volume.chapterCount : volume.topLevelCount
  return (
    <section className="bd-line border-b last:border-b-0">
      <div className="flex items-center">
      {ctx.select && <VolumeCheck ctx={ctx} volume={volume} />}
      <button onClick={onToggle} aria-expanded={open} className="flex h-12 w-full items-center justify-between px-3 text-left">
        <span className="min-w-0 font-medium">
          {volume.en || volume.ar || volume.ur || `Volume ${volume.sort}`}
          <span className="c-muted ml-2 text-xs font-normal">{count} chapters</span>
        </span>
        {count > 0 && <span className="c-muted">{chev(open)}</span>}
      </button>
      </div>
      {ctx.select?.note(volumeKey(volume.slug)) && <p className="px-3 pb-2 text-[11px] text-red-600" role="alert">{ctx.select.note(volumeKey(volume.slug))}</p>}
      {open && count > 0 && <div className="pb-3"><ChapterLevel ctx={ctx} volume={volume.slug} parent={null} trail={[volumeKey(volume.slug)]} /></div>}
    </section>
  )
}

/**
 * Lazily-loaded contents: volumes (if any) -> top-level chapters -> nested sections.
 * Used on the book page and in the reader sidebar. The filter only searches the titles already loaded.
 */
export function ChapterBrowser({ book, volumes, active, openVolume, openPath = [], select, singleOpen = false }: {
  book: string; volumes: Volume[]; active?: string; openVolume?: string | null; openPath?: string[]; select?: SelectApi; singleOpen?: boolean
}) {
  const [openVols, setOpenVols] = useState<Set<string>>(() => new Set(volumes.length === 1 && volumes[0] ? [volumes[0].slug] : openVolume ? [openVolume] : []))
  // the shell persists across chapters: follow the newly shown chapter's volume
  useEffect(() => {
    if (!openVolume) return
    setOpenVols((s) => (s.has(openVolume) ? s : new Set(singleOpen ? [openVolume] : [...s, openVolume])))
  }, [openVolume, singleOpen])
  const toggleVol = (slug: string) => setOpenVols((s) => {
    if (s.has(slug)) { const n = new Set(s); n.delete(slug); return n }
    return singleOpen ? new Set([slug]) : new Set([...s, slug])
  })
  const [q, setQ] = useState("")
  const [topics, setTopics] = usePref<boolean>("topics", true)
  const ctx: Ctx = { book, filter: norm(q.trim()), topics, active, openPath, select }
  const rootRef = useRef<HTMLDivElement>(null)

  // On load / refresh, bring the selected entry into view inside the sidebar. The tree loads lazily (volume -> booklet -> chapters),
  // so keep re-centering while it grows, and stop as soon as the reader scrolls or touches the sidebar (never fight the user).
  useEffect(() => {
    const root = rootRef.current
    const scroller = root?.closest<HTMLElement>(".overflow-y-auto")
    if (!root || !scroller || !active) return
    const sel = `[data-nav="${CSS.escape(active)}"]`
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      observer.disconnect()
      clearTimeout(timer)
      events.forEach((e) => scroller.removeEventListener(e, stop))
    }
    const center = () => {
      const el = root.querySelector<HTMLElement>(sel)
      if (!el) return
      const s = scroller.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      scroller.scrollTop += r.top - s.top - (s.height - r.height) / 2 // only the sidebar moves, not the page
    }
    const observer = new MutationObserver(center)
    observer.observe(root, { childList: true, subtree: true })
    events.forEach((e) => scroller.addEventListener(e, stop, { passive: true }))
    timer = setTimeout(stop, 8000)
    center()
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount (refresh / arriving at the reader); later clicks must not move the sidebar
  }, [])

  return (
    <div ref={rootRef}>
      <div className="mb-3 space-y-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Filter chapter titles…" aria-label="Filter chapter titles"
          className="bg-lib-bg w-full rounded-xl px-3 py-2 text-sm outline-none" />
        <button type="button" role="switch" aria-checked={topics} onClick={() => setTopics((o) => !o)} className="flex w-full items-center justify-between px-1 text-sm">
          <span className="c-muted">Show Topics</span>
          <span className={`relative h-5 w-9 rounded-full transition-colors ${topics ? "bg-lib-accent" : "bg-(--lib-line)"}`}>
            <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${topics ? "translate-x-4" : ""}`} />
          </span>
        </button>
      </div>
      {volumes.length === 0 ? (
        <ChapterLevel ctx={ctx} volume={null} parent={null} trail={[]} />
      ) : (
        <div>
          {volumes.map((v) => <VolumeSection key={v.id} ctx={ctx} volume={v} open={openVols.has(v.slug)} onToggle={() => toggleVol(v.slug)} />)}
        </div>
      )}
    </div>
  )
}
