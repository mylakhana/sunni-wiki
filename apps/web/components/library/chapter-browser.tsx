"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { loadChapterLevel } from "@/lib/actions"
import type { ChapterItem, Volume } from "@/lib/types"
import { titleOf } from "@/lib/types"
import { ChapterTitles } from "./chapter-titles"
import { usePref } from "./use-pref"

type Level = { items: ChapterItem[] } | { error: true }
type Ctx = { book: string; filter: string; topics: boolean; active?: string; openPath: string[] }

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
function ChapterLevel({ ctx, volume, parent, quiet = false, only, onEmpty }: { ctx: Ctx; volume: string | null; parent: string | null; quiet?: boolean; only?: number[]; onEmpty?: () => void }) {
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
  return <ul className="space-y-0.5">{items.map((c) => <ChapterNode key={c.id} ctx={ctx} item={c} />)}</ul>
}

/** Level 0 (e.g. "Book of Prayer"): a grouping title above its booklets / chapters. Not a link, not collapsible. */
function GroupNode({ ctx, item }: { ctx: Ctx; item: ChapterItem }) {
  return (
    <li className="pt-2">
      <div className="c-gold px-3 pt-1 pb-1 [&_div]:font-semibold" data-group={item.slug}>
        <ChapterTitles t={item} />
      </div>
      <div className="border-lib-line ml-3 border-l pl-1">
        <ChapterLevel ctx={ctx} volume={null} parent={item.id} quiet />
      </div>
    </li>
  )
}

function ChapterNode({ ctx, item }: { ctx: Ctx; item: ChapterItem }) {
  const [open, setOpen] = useState(() => ctx.openPath.includes(item.id))
  const [empty, setEmpty] = useState(false) // discovered at runtime: expanded, yet the level has nothing to show
  const markEmpty = useCallback(() => { setEmpty(true); setOpen(false) }, [])
  const wantOpen = ctx.openPath.includes(item.id)
  // the shell persists across chapters: open the ancestors of the newly shown chapter
  useEffect(() => { if (wantOpen) setOpen(true) }, [wantOpen])
  if (item.level === 0) return <GroupNode ctx={ctx} item={item} />
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
        <Link href={`/books/${encodeURIComponent(ctx.book)}/${encodeURIComponent(item.slug)}`} aria-current={isActive ? "page" : undefined} className="min-w-0 flex-1 py-2 pr-3">
          <ChapterTitles t={item} />
        </Link>
      </div>
      {open && expandable && (
        <div className="border-lib-line ml-4 border-l pl-1">
          <ChapterLevel ctx={ctx} volume={null} parent={item.id} only={item.level === 1 ? [2] : undefined} onEmpty={markEmpty} />
        </div>
      )}
    </li>
  )
}

function VolumeSection({ ctx, volume, defaultOpen }: { ctx: Ctx; volume: Volume; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => { if (defaultOpen) setOpen(true) }, [defaultOpen])
  const count = ctx.topics ? volume.chapterCount : volume.topLevelCount
  return (
    <section className="bd-line border-b last:border-b-0">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex h-12 w-full items-center justify-between px-3 text-left">
        <span className="min-w-0 font-medium">
          {volume.en || volume.ar || volume.ur || `Volume ${volume.sort}`}
          <span className="c-muted ml-2 text-xs font-normal">{count} chapters</span>
        </span>
        {count > 0 && <span className="c-muted">{chev(open)}</span>}
      </button>
      {open && count > 0 && <div className="pb-3"><ChapterLevel ctx={ctx} volume={volume.slug} parent={null} /></div>}
    </section>
  )
}

/**
 * Lazily-loaded contents: volumes (if any) -> top-level chapters -> nested sections.
 * Used on the book page and in the reader sidebar. The filter only searches the titles already loaded.
 */
export function ChapterBrowser({ book, volumes, active, openVolume, openPath = [] }: {
  book: string; volumes: Volume[]; active?: string; openVolume?: string | null; openPath?: string[]
}) {
  const [q, setQ] = useState("")
  const [topics, setTopics] = usePref<boolean>("topics", true)
  const ctx: Ctx = { book, filter: norm(q.trim()), topics, active, openPath }
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
        <ChapterLevel ctx={ctx} volume={null} parent={null} />
      ) : (
        <div>
          {volumes.map((v) => <VolumeSection key={v.id} ctx={ctx} volume={v} defaultOpen={volumes.length === 1 || v.slug === openVolume} />)}
        </div>
      )}
    </div>
  )
}
