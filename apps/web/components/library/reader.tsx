"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { BuiltContext } from "@/lib/ai-context"
import { saveLastRead, store } from "@/lib/store"
import { titleOf, type BookDetail, type ChapterDetail } from "@/lib/types"
import { langName } from "@/lib/ui"
import { AskAiContext, AskAiPicker } from "./ask-ai"
import { AskAiChat } from "./ask-ai-chat"
import { BookCover } from "./book-cover"
import { ChapterBrowser } from "./chapter-browser"
import { ChapterTitles } from "./chapter-titles"
import { DEFAULT_PREFS, typingTarget, type Prefs } from "./reader-prefs"
import { usePref } from "./use-pref"
import "./reader.css"

type Tab = "contents" | "about"
export type Meta = Omit<ChapterDetail, "tei">
type Current = { chapter: Meta; part: number; scroll?: boolean } // scroll: became current by scrolling (do not reset/restore the scroll position)
/** Lets the (per-chapter) page content tell the persistent shell which chapter is showing. */
const ShellCtx = createContext<((c: Current) => void) | null>(null)
export const useSetCurrentChapter = () => useContext(ShellCtx)

const GLASS: React.CSSProperties = { background: "color-mix(in srgb, var(--lib-bg) 40%, transparent)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)" }
const FS_MIN = 0.6
const FS_MAX = 2
const FS_STEP = 0.1
const sizeBtn = "c-muted grid h-8 w-8 place-items-center rounded-full hover:bg-(--lib-accent-soft) disabled:opacity-30"
export const href = (book: string, chapter: string) => `/books/${encodeURIComponent(book)}/${encodeURIComponent(chapter)}`

export const clip = (t: string, n = 40) => (t.length > n ? t.slice(0, n).trimEnd() + "…" : t)

/** Shell around ONE chapter: toolbar, contents sidebar, preferences. `children` is the server-rendered chapter text. */
export function ReaderShell({ book, children }: { book: BookDetail; children: React.ReactNode }) {
  const [cur, setCurState] = useState<Current | null>(null)
  const curRef = useRef<Current | null>(null)
  const byScroll = useRef(false)
  const setCur = useCallback((c: Current) => {
    if (c.scroll && curRef.current?.chapter.slug === c.chapter.slug) return
    curRef.current = c
    byScroll.current = !!c.scroll
    setCurState(c)
  }, [])
  const chapter = cur?.chapter ?? null
  const part = cur?.part ?? 1
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("contents")
  const [fs, setFs] = usePref<number>("fs", 1)
  const [prefs, setPrefs] = usePref<Prefs>("rd", DEFAULT_PREFS)
  const [drawer, setDrawer] = useState(false)
  // PROTOTYPE "Ask AI": off -> pick (choose context in left panel) -> chat (context in main, chat on the right)
  const [ai, setAi] = useState<"off" | "pick" | "chat">("off")
  const [aiIds, setAiIds] = useState<string[]>([])
  const [chatOpen, setChatOpen] = useState(true) // mobile only: chat is full-screen; collapsing reveals the context + page behind it
  const [aiReady, setAiReady] = useState(false) // context fetched / restored and validated: the chat panel may open
  const chatCovering = ai === "chat" && aiReady && chatOpen
  useEffect(() => { // mobile: the full-screen chat must not let the page behind it scroll
    if (!chatCovering || !window.matchMedia("(max-width: 1023px)").matches) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [chatCovering])
  const [aiCtx, setAiCtx] = useState<BuiltContext | null>(null) // the exact system prompt + context the chat sends
  const [aiFresh, setAiFresh] = useState(false) // true right after the picker fetched everything (no need to revalidate)
  const startAi = () => { setChatOpen(true); setAi("pick"); patch({ collapsed: false }); setDrawer(true) }
  /** Mirrors chat mode into the address bar (no navigation, so the server page is not re-rendered). */
  const syncUrl = (ids: string[] | null) => {
    const u = new URL(location.href)
    if (ids) { u.searchParams.set("ai", "1"); u.searchParams.set("ctx", ids.join(".")) }
    else { u.searchParams.delete("ai"); u.searchParams.delete("ctx") }
    history.replaceState(history.state, "", u)
  }
  const exitAi = () => { if (ai === "chat") try { sessionStorage.removeItem(`ask-ai:${aiIds.join(".")}`) } catch {}; setAi("off"); setAiReady(false); setAiCtx(null); setDrawer(false); syncUrl(null) }
  // refresh / shared link: restore chat mode from ?ai=1&ctx=…
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const ids = [...new Set((q.get("ctx") ?? "").split(".").filter((x) => /^\d{1,12}$/.test(x)))].slice(0, 500) // validated for real by AskAiContext (404s dropped)
    if (q.get("ai") === "1" && ids.length) { setAiIds(ids); setAiFresh(false); setAi("chat") }
  }, [])
  const readerRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  const prev = chapter?.prev
  const next = chapter?.next
  const volume = chapter?.volume
  const patch = (p: Partial<Prefs>) => setPrefs((o) => ({ ...o, ...p }))
  const [copied, setCopied] = useState(false)
  const shareChapter = async () => {
    const url = location.origin + location.pathname
    try {
      if (navigator.share) await navigator.share({ title: book.title, url })
      else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }
    } catch {}
  }
  const changeFs = (d: number) => setFs((o) => Math.min(FS_MAX, Math.max(FS_MIN, +(o + d).toFixed(2))))
  const chTitle = chapter ? titleOf(chapter) : ""
  const posKey = `${chapter?.slug}:${part}` // scroll position is remembered per chapter part

  // remember the last chapter (all slugs) and restore the scroll offset inside it
  useEffect(() => {
    if (!chapter) return
    saveLastRead({ book: book.id, vol: volume?.slug ?? null, ch: chapter.slug, title: chTitle })
    if (byScroll.current) return // reached by scrolling down the stream: keep the position
    const pos = store.get<{ ch?: string; off?: number } | null>(`pos:${book.id}`, null)
    if (window.location.hash || new URLSearchParams(window.location.search).has("q")) return // sub-topic anchor (hash effect) or shared/search passage (highlight effect) scrolls itself
    if (pos?.ch === posKey && typeof pos.off === "number") {
      const t = setTimeout(() => window.scrollTo({ top: pos.off }), 100)
      return () => clearTimeout(t)
    }
    window.scrollTo({ top: 0 })
  }, [book.id, chapter, posKey, volume?.slug, chTitle])

  // Jump to a sub-topic anchor (#s-1.001.010). Runs after every render, because following a sub-topic link
  // inside the same chapter changes only the hash, and after a server redirect the router may set the hash a moment
  // after this commit (so poll briefly). Ids contain dots: use getElementById.
  const lastHash = useRef("")
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let polls = 0
    const jump = (h: string) => {
      // Blocks use content-visibility:auto (estimated heights), so one scrollIntoView undershoots: re-aim until it settles.
      let tries = 0
      let settled = 0
      const step = () => {
        let el: HTMLElement | null = null
        try { el = document.getElementById(decodeURIComponent(h.slice(1))) } catch {}
        if (el) {
          el.scrollIntoView({ behavior: "instant" }) // the page has scroll-behavior:smooth, which would cancel the re-aiming
          const off = Math.abs(el.getBoundingClientRect().top - parseFloat(getComputedStyle(el).scrollMarginTop || "0")) > 8
          settled = off ? 0 : settled + 1
          if (settled >= 2) return
        }
        if (++tries < 40) timer = setTimeout(step, 100)
      }
      step()
    }
    const poll = () => {
      const h = window.location.hash
      if (!h) lastHash.current = ""
      else if (h !== lastHash.current) { lastHash.current = h; jump(h); return }
      if (++polls < 20) timer = setTimeout(poll, 100)
    }
    poll()
    return () => clearTimeout(timer)
  })

  // progress bar + remember scroll offset
  useEffect(() => {
    let raf = 0
    let t: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      raf = 0
      const m = readerRef.current
      if (!m || !barRef.current) return
      const top = m.getBoundingClientRect().top + window.scrollY
      const p = (window.scrollY - top + 150) / Math.max(1, m.offsetHeight - window.innerHeight + 150)
      barRef.current.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`
      clearTimeout(t)
      if (!byScroll.current) t = setTimeout(() => store.set(`pos:${book.id}`, { ch: posKey, off: Math.round(window.scrollY) }), 400)
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(update) }
    window.addEventListener("scroll", on, { passive: true })
    window.addEventListener("resize", on)
    on()
    return () => {
      window.removeEventListener("scroll", on)
      window.removeEventListener("resize", on)
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [book.id, posKey])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingTarget(e.target)) return
      const wide = window.matchMedia("(min-width: 1024px)").matches
      if (e.key === "[") {
        if (wide) setPrefs((o) => ({ ...o, collapsed: !o.collapsed }))
        else setDrawer((d) => !d)
      } else if (e.key === "Escape") {
        setDrawer(false)
      } else if (e.key === "ArrowRight" && next) {
        e.preventDefault(); router.push(href(book.id, next.slug))
      } else if (e.key === "ArrowLeft" && prev) {
        e.preventDefault(); router.push(href(book.id, prev.slug))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [book.id, next, prev, router, setPrefs])

  return (
    <ShellCtx.Provider value={setCur}>
    <div
      className={`reader-root ${prefs.collapsed || ai === "chat" ? "collapsed" : ""} ${ai === "chat" ? "ai-chat" : ""}`}
      style={{ "--fs": fs } as React.CSSProperties} // text size multiplier, read by .reader-area
    >
      <div ref={barRef} className="bg-lib-accent fixed top-0 left-0 z-[70] h-[3px] w-full origin-left" style={{ transform: "scaleX(0)" }} role="progressbar" aria-label="Reading progress" />
      {/* one shared blur layer behind the site header + reading toolbar, so there is no seam */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-20" style={{ height: "calc(var(--hdr) + 57px)", ...GLASS }} />
      {/* Reading toolbar */}
      <div className="reader-bar bd-line sticky z-30 border-b" style={{ top: "var(--hdr)" }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h1 className="truncate text-sm font-semibold">{book.title}</h1>
            <p className="c-muted truncate text-[11px]">{volume ? `${titleOf(volume, "Volume")} · ` : ""}{chTitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center rounded-full p-0.5" style={{ background: "var(--lib-line)" }} role="group" aria-label="Text size">
            <button onClick={() => changeFs(-FS_STEP)} disabled={fs <= FS_MIN} className={sizeBtn} aria-label="Decrease text size" title="Decrease text size">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M3 19 9 5l6 14M5 14h8M17 6h5" /></svg>
            </button>
            <button onClick={() => setFs(1)} className="c-muted num h-8 w-11 rounded-full text-xs font-medium" aria-label={`Text size ${Math.round(fs * 100)}%, reset to 100%`} title="Reset to 100%">{Math.round(fs * 100)}%</button>
            <button onClick={() => changeFs(FS_STEP)} disabled={fs >= FS_MAX} className={sizeBtn} aria-label="Increase text size" title="Increase text size">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M3 19 9 5l6 14M5 14h8M19 3v6M16 6h6" /></svg>
            </button>
          </div>
          <button onClick={ai === "off" ? startAi : exitAi} aria-pressed={ai !== "off"} className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${ai !== "off" ? "bg-lib-accent text-(--lib-bg)" : "c-muted hover:bg-(--lib-accent-soft)"}`} style={ai === "off" ? { background: "var(--lib-line)" } : undefined} title="SunniWiki AI">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4l1.8 4.7L15.5 10.5l-4.7 1.8L9 17l-1.8-4.7L2.5 10.5l4.7-1.8L9 4zM18 3v4M16 5h4M18 15v4M16 17h4" /></svg><span className="hidden sm:inline">SunniWiki AI</span>
          </button>
          <button onClick={shareChapter} className="c-muted flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium hover:bg-(--lib-accent-soft)" style={{ background: "var(--lib-line)" }} aria-label="Share this chapter" title="Share this chapter">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" /></svg>
            <span className="hidden sm:inline">{copied ? "Copied" : "Share"}</span>
          </button>
          </div>
        </div>
      </div>

      <div className="reader-grid mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        {/* Left: contents */}
        <aside id="side" className={`card flex flex-col overflow-hidden lg:sticky ${drawer ? "open" : ""}`}>
          {ai === "pick" ? <AskAiPicker book={book.id} volumes={book.volumeList} active={chapter?.slug} openVolume={volume?.slug}
            openPath={chapter?.breadcrumb.filter((b) => b.slug !== chapter.slug).map((b) => b.id)} onCancel={exitAi} onProceed={(ids) => { setAiIds(ids); setAiFresh(true); setAi("chat"); setDrawer(false); syncUrl(ids) }} /> : <>
          <div className="flex items-center gap-2 p-3 pb-0">
            <div className="seg flex flex-1 rounded-xl p-0.5" style={{ background: "var(--lib-line)" }} role="tablist">
              {(["contents", "about"] as Tab[]).map((k) => (
                <button key={k} role="tab" onClick={() => setTab(k)} aria-pressed={tab === k} aria-selected={tab === k}
                  className="c-muted h-9 flex-1 rounded-lg text-sm font-medium capitalize">{k}</button>
              ))}
            </div>
            <button onClick={() => setDrawer(false)} className="c-muted h-10 w-10 shrink-0 rounded-full lg:hidden" style={{ background: "var(--lib-line)" }} aria-label="Close contents">✕</button>
            <button onClick={() => patch({ collapsed: true })} className="c-muted hidden h-10 w-10 shrink-0 place-items-center rounded-full lg:grid" style={{ background: "var(--lib-accent-soft)" }} aria-label="Hide contents" title="Hide contents ([)">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>
            </button>
          </div>

          <div className="relative flex-1 overflow-y-auto p-3">
            {tab === "contents" && chapter && (
              <ChapterBrowser book={book.id} volumes={book.volumeList} active={chapter.slug} openVolume={volume?.slug} openPath={chapter.breadcrumb.map((b) => b.id)} singleOpen />
            )}
            {tab === "about" && (
              <div className="p-2">
                <div className="mx-auto w-28"><BookCover book={book} /></div>
                <h2 className="mt-5 text-center text-lg font-semibold">{book.title}</h2>
                {book.author
                  ? <Link href={`/authors/${book.author}`} className="c-accent block text-center text-sm">{book.authorName}</Link>
                  : <p className="c-muted text-center text-sm">{book.authorName}</p>}
                {book.blurb && (/[؀-ۿ]/.test(book.blurb)
                  ? <p dir="rtl" lang="ur" className="c-muted font-ur mt-4 whitespace-pre-line text-right text-base leading-[2.2]">{book.blurb}</p>
                  : <p className="c-muted mt-4 text-sm leading-relaxed">{book.blurb}</p>)}
                <dl className="mt-5 text-sm">
                  {([
                    ["Topic", <Link key="t" href={`/browse?category=${book.cat}`} className="c-accent">{book.catName}</Link>],
                    book.langs.length ? ["Languages", book.langs.map(langName).join(", ")] : null,
                    ["Volumes", book.volumes > 0 ? book.volumes : "Single book"],
                  ].filter(Boolean) as [string, React.ReactNode][]).map(([k, v]) => (
                    <div key={k} className="bd-line flex justify-between border-t py-3">
                      <dt className="c-muted">{k}</dt><dd className="font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <a href={`/api/books/${encodeURIComponent(book.id)}/export`} download className="bd-line c-accent mt-2 flex items-center justify-between border-t py-3 text-sm font-medium" title="Download the entire book as TEI XML (zip, one file per volume)">
                  <span>Download entire book (zip)</span>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16" /></svg>
                </a>
              </div>
            )}
          </div>
          </>}
        </aside>
        {prefs.collapsed && (
          <button onClick={() => patch({ collapsed: false })} className="card fixed z-30 hidden h-10 w-10 place-items-center rounded-full lg:grid"
            style={{ top: "calc(var(--hdr) + 72px)", left: "max(12px, calc((100vw - 72rem) / 2 + 12px))" }} aria-label="Show contents" title="Show contents ([)">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>
          </button>
        )}
        {drawer && <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setDrawer(false)} />}

        {/* Right: this chapter */}
        <main ref={readerRef} className="reader-area min-w-0 pb-8">
          {ai === "chat" ? <AskAiContext book={book.id} authorPrompt={book.authorPrompt} ids={aiIds} fresh={aiFresh} onExit={exitAi} onContext={setAiCtx} onResolved={(ids) => { if (!ids.length) { exitAi(); return } if (ids.length !== aiIds.length) { setAiIds(ids); syncUrl(ids) } setAiReady(true) }} /> : children}
        </main>
        {ai === "chat" && aiReady && aiCtx && chatOpen && <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setChatOpen(false)} aria-hidden="true" />}
        {ai === "chat" && aiReady && aiCtx && (
          <aside className={`card fixed inset-x-0 top-12 bottom-0 z-50 flex flex-col overflow-hidden rounded-b-none shadow-2xl lg:sticky lg:inset-auto lg:z-auto lg:flex lg:h-[calc(100vh-var(--hdr)-100px)] lg:rounded-2xl lg:shadow-none lg:top-[calc(var(--hdr)+72px)] ${chatOpen ? "" : "max-lg:hidden"}`} aria-label="SunniWiki AI chat">
            <AskAiChat key={aiIds.join(".")} count={aiIds.length} ctx={aiCtx} storageKey={`ask-ai:${aiIds.join(".")}`} onExit={exitAi} onCollapse={() => setChatOpen(false)} />
          </aside>
        )}
      </div>

      {ai === "chat" && aiReady && aiCtx && !chatOpen && (
        <button onClick={() => setChatOpen(true)} className="card c-accent fixed right-4 bottom-5 z-40 flex h-12 items-center gap-2 rounded-full px-5 text-sm font-medium shadow-xl lg:hidden">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4l1.8 4.7L15.5 10.5l-4.7 1.8L9 17l-1.8-4.7L2.5 10.5l4.7-1.8L9 4zM18 3v4M16 5h4M18 15v4M16 17h4" /></svg> Chat
        </button>
      )}
      {ai !== "chat" && (
        <button onClick={() => setDrawer(true)}
          className="card c-accent fixed bottom-5 left-1/2 z-40 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full px-6 text-sm font-medium shadow-xl lg:hidden">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" /></svg> Contents
        </button>
      )}
    </div>
    </ShellCtx.Provider>
  )
}
