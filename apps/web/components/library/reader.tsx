"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { authorOf, buildContent, buildVolumes, catOf, type Block, type Book, type Chapter } from "@/lib/data"
import { saveLastRead, store } from "@/lib/store"
import { BlockView } from "./block"
import { BookCover } from "./book-cover"
import { DEFAULT_PREFS, WIDTHS, norm, typingTarget, type Prefs, type Width } from "./reader-prefs"
import "./reader.css"

type Lang = "all" | "ar" | "ur" | "en"
type Tab = "volumes" | "chapters" | "about"

const GLASS: React.CSSProperties = { background: "color-mix(in srgb, var(--lib-bg) 40%, transparent)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)" }
const LANGS: [Lang, string][] = [["all", "All"], ["ar", "عربی"], ["ur", "اردو"], ["en", "EN"]]

function Titles({ ch, lang, big }: { ch: Chapter; lang: Lang; big: boolean }) {
  const show = (k: Lang) => lang === "all" || lang === k
  return (
    <>
      {show("ar") && <div className={`font-ar ${big ? "text-4xl leading-[1.6] sm:text-5xl" : "text-right text-lg leading-[1.6]"}`} dir="rtl">{ch.ar}</div>}
      {show("ur") && (
        <div className={`font-ur ${big ? "text-2xl leading-[2.2] sm:text-3xl" : "text-right text-sm leading-[2]"} ${lang === "all" ? "c-muted" : ""}`} dir="rtl">{ch.ur}</div>
      )}
      {show("en") && <div className={`${big ? "text-xl sm:text-2xl" : "text-[13px]"} font-semibold tracking-tight`}>{ch.en}</div>}
    </>
  )
}

function blockText(b: Block): string {
  switch (b.t) {
    case "verse": return `${b.ar} ${b.ur} ${b.en} ${b.ref}`
    case "table": return `${b.head.join(" ")} ${b.rows.map((r) => r.join(" ")).join(" ")}`
    default: return b.x
  }
}

type Hit = { vol: number; ch: Chapter; snip: string }

export function Reader({ book, initialVol }: { book: Book; initialVol: number | null }) {
  const author = authorOf(book)
  const cat = catOf(book)
  const vols = useMemo(() => buildVolumes(book), [book])
  const hasVols = book.volumes > 0

  const [vol, setVol] = useState(() => Math.min(Math.max(initialVol || 1, 1), vols.length))
  const [tab, setTab] = useState<Tab>(hasVols && !initialVol ? "volumes" : "chapters")
  const [lang, setLang] = useState<Lang>("all")
  const [fs, setFs] = useState(1)
  const [active, setActive] = useState<string | null>(null)
  const [drawer, setDrawer] = useState(false)
  const readerRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const pending = useRef<{ id: string; off?: number } | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [focus, setFocus] = useState(false)
  const [panel, setPanel] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState("")
  const [sel, setSel] = useState<{ x: number; y: number; text: string; ch: string | null } | null>(null)
  const [copied, setCopied] = useState(false)

  const current = vols[vol - 1]!

  // restore saved reading preferences after mount (avoids hydration mismatch)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setLang(store.get<Lang>("lang", "all"))
    setFs(store.get<number>("fs", 1))
    setPrefs({ ...DEFAULT_PREFS, ...store.get<Partial<Prefs>>("rd", {}) })
  }, [])
  const patch = (p: Partial<Prefs>) => setPrefs((o) => { const n = { ...o, ...p }; store.set("rd", n); return n })

  const flat = useMemo(() => vols.flatMap((v) => v.chapters.map((c) => ({ vol: v.n, c }))), [vols])
  const idx = flat.findIndex((f) => f.c.id === active)

  const index = useMemo(
    () => flat.map((f) => ({ ...f, text: [f.c.en, f.c.ar, f.c.ur, ...buildContent(book, f.c).map(blockText)].join(" \n ") })),
    [flat, book],
  )
  const hits = useMemo<Hit[]>(() => {
    const n = norm(q.trim())
    if (n.length < 2) return []
    const out: Hit[] = []
    for (const f of index) {
      const t = norm(f.text)
      const i = t.indexOf(n)
      if (i < 0) continue
      const a = Math.max(0, i - 30)
      out.push({ vol: f.vol, ch: f.c, snip: (a ? "…" : "") + f.text.replace(/\s+/g, " ").slice(a, i + n.length + 50) })
      if (out.length >= 30) break
    }
    return out
  }, [q, index])
  useEffect(() => {
    document.documentElement.style.setProperty("--fs", String(fs))
    return () => {
      document.documentElement.style.removeProperty("--fs")
    }
  }, [fs])

  const changeLang = (l: Lang) => { setLang(l); store.set("lang", l) }
  const changeFs = (d: number) => {
    const next = Math.min(1.6, Math.max(0.85, +(fs + d).toFixed(2)))
    setFs(next)
    store.set("fs", next)
  }

  const openVolume = useCallback((n: number) => {
    setVol(n)
    setTab("chapters")
    setActive(vols[n - 1]!.chapters[0]!.id)
    window.history.replaceState(null, "", `/books/${book.id}?vol=${n}`)
    window.scrollTo({ top: 0 })
    setDrawer(false)
  }, [vols, book.id])

  const scrollToCh = (id: string, off = 0, smooth = true) => {
    const el = document.getElementById(`ch-${id}`)
    if (!el) return false
    if (off) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + off - 150 })
    else el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" })
    return true
  }

  // jump to any chapter, across volumes
  const jump = useCallback((v: number, id: string) => {
    setDrawer(false)
    if (v !== vol) {
      pending.current = { id }
      setVol(v)
      setTab("chapters")
      window.history.replaceState(null, "", `/books/${book.id}?vol=${v}`)
    } else {
      scrollToCh(id)
    }
    setActive(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vol, book.id])

  // finish a cross-volume jump once the new volume has rendered
  useEffect(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    scrollToCh(p.id, p.off ?? 0, false)
  }, [vol])

  // scroll to hash on first load, else resume last position
  useEffect(() => {
    if (window.location.hash) {
      const t = setTimeout(() => document.querySelector(window.location.hash)?.scrollIntoView(), 100)
      return () => clearTimeout(t)
    }
    if (initialVol) return
    const pos = store.get<{ vol: number; ch: string; off: number } | null>(`pos:${book.id}`, null)
    if (!pos || !vols[pos.vol - 1]?.chapters.some((c) => c.id === pos.ch)) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setTab("chapters")
    if (pos.vol === vol) {
      const t = setTimeout(() => scrollToCh(pos.ch, pos.off, false), 100)
      return () => clearTimeout(t)
    }
    pending.current = { id: pos.ch, off: pos.off }
    setVol(pos.vol)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // progress bar + remember scroll offset within the active chapter
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
      t = setTimeout(() => {
        const cards = Array.from(m.querySelectorAll<HTMLElement>(".chapter-card"))
        const cur = [...cards].reverse().find((c) => c.getBoundingClientRect().top <= 200) ?? cards[0]
        if (!cur) return
        const off = Math.max(0, 150 - cur.getBoundingClientRect().top)
        store.set(`pos:${book.id}`, { vol, ch: cur.dataset.id, off: Math.round(off) })
      }, 300)
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
  }, [vol, book.id])

  // keep the active chapter visible in the sidebar list
  useEffect(() => {
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>(`[data-nav="${active}"]`)
    if (!list || !el) return
    const a = el.offsetTop - list.offsetTop
    if (a < list.scrollTop || a + el.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = a - list.clientHeight / 3
  }, [active, tab, drawer, prefs.collapsed])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingTarget(e.target)) return
      const wide = window.matchMedia("(min-width: 1024px)").matches
      if (e.key === "[") {
        if (wide) patch({ collapsed: !prefs.collapsed })
        else setDrawer((d) => !d)
      } else if (e.key === "f" || e.key === "F") {
        setFocus((f) => !f)
        setDrawer(false)
      } else if (e.key === "Escape") {
        setDrawer(false); setPanel(false)
        if (focus) setFocus(false)
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const n = flat[Math.max(idx, 0) + (e.key === "ArrowRight" ? 1 : -1)]
        if (n && idx >= 0) { e.preventDefault(); jump(n.vol, n.c.id) }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.collapsed, focus, flat, idx, jump])

  // close the settings menu on outside click / touch
  useEffect(() => {
    if (!panel) return
    const down = (e: PointerEvent) => { if (!panelRef.current?.contains(e.target as Node)) setPanel(false) }
    document.addEventListener("pointerdown", down)
    return () => document.removeEventListener("pointerdown", down)
  }, [panel])

  // select-to-copy
  useEffect(() => {
    const onSel = () => {
      const s = window.getSelection()
      const m = readerRef.current
      if (!s || s.isCollapsed || !m || !s.anchorNode || !m.contains(s.anchorNode)) return setSel(null)
      const text = s.toString().trim()
      if (!text) return setSel(null)
      const r = s.getRangeAt(0).getBoundingClientRect()
      const ch = (s.anchorNode.parentElement?.closest("[data-id]") as HTMLElement | null)?.dataset.id ?? null
      setSel({ x: Math.min(Math.max(r.left + r.width / 2, 60), window.innerWidth - 60), y: Math.max(r.top - 8, 70), text, ch })
    }
    const hide = () => setSel(null)
    document.addEventListener("selectionchange", onSel)
    window.addEventListener("scroll", hide, { passive: true })
    return () => { document.removeEventListener("selectionchange", onSel); window.removeEventListener("scroll", hide) }
  }, [])

  const copySel = async () => {
    if (!sel) return
    const c = current.chapters.find((x) => x.id === sel.ch)
    const ref = [book.title, hasVols ? `Volume ${vol}` : null, c ? `Chapter ${c.n}: ${c.en}` : null].filter(Boolean).join(", ")
    const out = `${sel.text}\n\n— ${ref}`
    try { await navigator.clipboard.writeText(out) } catch {
      const ta = document.createElement("textarea")
      ta.value = out; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove()
    }
    setCopied(true)
    setTimeout(() => { setCopied(false); setSel(null); window.getSelection()?.removeAllRanges() }, 900)
  }

  // track the chapter in view and remember it
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const id = (e.target as HTMLElement).dataset.id!
          setActive(id)
          const c = current.chapters.find((x) => x.id === id)
          if (c) saveLastRead({ book: book.id, vol, ch: id, n: c.n })
        }
      },
      { rootMargin: "-25% 0px -65% 0px" },
    )
    readerRef.current?.querySelectorAll(".chapter-card").forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [current, vol, book.id])

  const goChapter = (id: string) => jump(vol, id)

  const sideItem = "side-item w-full rounded-xl text-left"

  const chip = "card h-9 rounded-full px-3 text-xs font-medium"
  const opt = (on: boolean) => `h-8 flex-1 rounded-lg text-xs font-medium ${on ? "bg-lib-accent text-white" : "c-muted bg-lib-bg"}`

  return (
    <div
      className={`reader-root ${prefs.collapsed ? "collapsed" : ""} ${focus ? "focus" : ""}`}
      style={{ "--measure": WIDTHS[prefs.width], "--lh": prefs.lh, "--rtl": prefs.rtl } as React.CSSProperties}
    >
      <div ref={barRef} className="bg-lib-accent fixed top-0 left-0 z-[70] h-[3px] w-full origin-left" style={{ transform: "scaleX(0)" }} role="progressbar" aria-label="Reading progress" />
      {focus && (
        <button onClick={() => setFocus(false)} className="card fixed top-3 right-3 z-40 h-9 rounded-full px-4 text-xs font-medium opacity-60 hover:opacity-100">Exit focus (F)</button>
      )}
      {/* one shared blur layer behind the site header + reading toolbar, so there is no seam */}
      {!focus && <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-20" style={{ height: "calc(var(--hdr) + 57px)", ...GLASS }} />}
      {/* Reading toolbar */}
      <div className={`reader-bar bd-line sticky z-30 border-b ${focus ? "hidden" : ""}`} style={{ top: "var(--hdr)" }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="c-accent inline-flex h-9 shrink-0 items-center gap-1 rounded-full pr-3 pl-2 text-sm font-medium" aria-label="Back to library" style={{ background: "var(--lib-accent-soft)" }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6" /></svg><span className="hidden sm:inline">Library</span>
          </Link>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h1 className="truncate text-sm font-semibold">{book.title}</h1>
            {idx >= 0 && <p className="c-muted num truncate text-[11px]">{hasVols ? `Vol ${vol} · ` : ""}Chapter {current.chapters.find((c) => c.id === active)?.n ?? 1} of {current.chapters.length}</p>}
          </div>
          <div ref={panelRef} className="relative shrink-0">
            <button onClick={() => setPanel((o) => !o)} className={chip} aria-expanded={panel} aria-label="Reading settings">Aa</button>
            {panel && (
              <div className="card bd-line absolute top-11 right-0 z-50 w-72 space-y-4 border p-4 text-sm shadow-xl">
                {([
                  ["Line width", <div key="w" className="flex gap-1">{(["narrow", "medium", "wide"] as Width[]).map((w) => <button key={w} onClick={() => patch({ width: w })} className={`${opt(prefs.width === w)} capitalize`}>{w}</button>)}</div>],
                  ["Line height", <div key="l" className="flex gap-1">{([["Tight", 0.9], ["Normal", 1], ["Loose", 1.2]] as [string, number][]).map(([t, v]) => <button key={t} onClick={() => patch({ lh: v })} className={opt(prefs.lh === v)}>{t}</button>)}</div>],
                  ["Arabic / Urdu size", <div key="r" className="flex items-center gap-2"><button onClick={() => patch({ rtl: Math.max(0.7, +(prefs.rtl - 0.1).toFixed(2)) })} className={opt(false)} aria-label="Smaller Arabic and Urdu">A−</button><span className="num w-12 text-center text-xs">{Math.round(prefs.rtl * 100)}%</span><button onClick={() => patch({ rtl: Math.min(1.6, +(prefs.rtl + 0.1).toFixed(2)) })} className={opt(false)} aria-label="Bigger Arabic and Urdu">A+</button></div>],
                  ["English size", <div key="e" className="flex items-center gap-2"><button onClick={() => changeFs(-0.1)} className={opt(false)} aria-label="Smaller English">A−</button><span className="num w-12 text-center text-xs">{Math.round(fs * 100)}%</span><button onClick={() => changeFs(0.1)} className={opt(false)} aria-label="Bigger English">A+</button></div>],
                ] as [string, React.ReactNode][]).map(([k, v]) => <div key={k}><p className="c-muted mb-1.5 text-xs">{k}</p>{v}</div>)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="reader-grid mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        {/* Left: contents */}
        <aside id="side" className={`card flex flex-col overflow-hidden lg:sticky ${drawer ? "open" : ""}`}>
          <div className="flex items-center gap-2 p-3 pb-0">
            <div className="seg flex flex-1 rounded-xl p-0.5" style={{ background: "var(--lib-line)" }} role="tablist">
              {(hasVols ? (["volumes", "chapters", "about"] as Tab[]) : (["chapters", "about"] as Tab[])).map((k) => (
                <button key={k} role="tab" onClick={() => setTab(k)} aria-pressed={tab === k}
                  className="c-muted h-9 flex-1 rounded-lg text-sm font-medium capitalize">{k}</button>
              ))}
            </div>
            <button onClick={() => setDrawer(false)} className="c-muted h-9 w-9 rounded-full lg:hidden" aria-label="Close contents">✕</button>
            <button onClick={() => patch({ collapsed: true })} className="c-muted hidden h-9 w-9 place-items-center rounded-full lg:grid" aria-label="Hide contents" title="Hide contents ([)">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6" /></svg>
            </button>
          </div>

          <div className="px-3 pt-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search in this book…" aria-label="Search in this book"
              className="bg-lib-bg w-full rounded-xl px-3 py-2 text-sm outline-none" />
          </div>
          <div ref={listRef} className="relative flex-1 overflow-y-auto p-3">
            {q.trim().length >= 2 ? (
              <>
                <p className="c-muted px-2 pb-2 text-xs">{hits.length ? `${hits.length} chapter${hits.length > 1 ? "s" : ""} match` : "No matches"}</p>
                {hits.map((h) => (
                  <button key={h.ch.id} onClick={() => { jump(h.vol, h.ch.id); setQ("") }} className={`${sideItem} p-3`}>
                    <span className="c-gold text-[11px] font-semibold tracking-wider uppercase">{hasVols ? `Vol ${h.vol} · ` : ""}Chapter {h.ch.n}</span>
                    <span className="block text-sm font-semibold">{h.ch.en}</span>
                    <span className="c-muted block text-xs">{h.snip}</span>
                  </button>
                ))}
              </>
            ) : null}
            {q.trim().length < 2 && tab === "volumes" && (
              <>
                <p className="c-muted px-2 pt-2 pb-3 text-sm">{vols.length} volumes · tap one to open it</p>
                {vols.map((v) => (
                  <button key={v.n} onClick={() => openVolume(v.n)}
                    className={`${sideItem} flex h-12 items-center justify-between px-4 ${v.n === vol ? "active" : ""}`}>
                    <span className="font-medium">Volume {v.n}</span><span className="c-muted">›</span>
                  </button>
                ))}
              </>
            )}

            {q.trim().length < 2 && tab === "chapters" && (
              <>
                <div className="flex items-center justify-between px-2 pt-2 pb-3">
                  <p className="text-sm font-semibold">{hasVols ? `Volume ${vol}` : "All chapters"}</p>
                  {hasVols && <button onClick={() => setTab("volumes")} className="c-accent text-sm">Change volume</button>}
                </div>
                <div className="seg mx-2 mb-3 flex rounded-full p-0.5" style={{ background: "var(--lib-line)" }} role="group" aria-label="Chapter title language">
                  {LANGS.map(([k, t]) => (
                    <button key={k} onClick={() => changeLang(k)} aria-pressed={lang === k}
                      className={`c-muted h-8 flex-1 rounded-full text-xs font-medium ${k === "ar" || k === "ur" ? "font-ar text-sm" : ""}`}>{t === "EN" ? "English" : t}</button>
                  ))}
                </div>
                {current.chapters.map((c) => (
                  <button key={c.id} data-nav={c.id} onClick={() => goChapter(c.id)}
                    className={`${sideItem} flex items-start gap-3 p-3 ${c.id === active ? "active" : ""}`}>
                    <span className="num c-muted bg-lib-bg mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold">{c.n}</span>
                    <span className="min-w-0 flex-1"><Titles ch={c} lang={lang} big={false} /></span>
                  </button>
                ))}
              </>
            )}

            {q.trim().length < 2 && tab === "about" && (
              <div className="p-2">
                <div className="mx-auto w-28"><BookCover book={book} /></div>
                <h2 className="mt-5 text-center text-lg font-semibold">{book.title}</h2>
                <Link href={`/authors/${author.id}`} className="c-accent block text-center text-sm">{author.name}</Link>
                <p className="c-muted mt-4 text-sm leading-relaxed">{book.blurb}</p>
                <dl className="mt-5 text-sm">
                  {([
                    ["Topic", <Link key="t" href={`/browse?category=${cat.id}`} className="c-accent">{cat.en}</Link>],
                    ["Languages", book.langs.join(", ")],
                    ["Volumes", hasVols ? book.volumes : "Single book"],
                    ["Chapters", vols.reduce((s, v) => s + v.chapters.length, 0)],
                  ] as [string, React.ReactNode][]).map(([k, v]) => (
                    <div key={k} className="bd-line flex justify-between border-t py-3">
                      <dt className="c-muted">{k}</dt><dd className="font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </aside>
        {(prefs.collapsed || focus) && !focus && (
          <button onClick={() => patch({ collapsed: false })} className="card fixed z-30 hidden h-10 w-10 place-items-center rounded-full lg:grid"
            style={{ top: "calc(var(--hdr) + 72px)", left: "max(12px, calc((100vw - 72rem) / 2 + 12px))" }} aria-label="Show contents" title="Show contents ([)">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>
          </button>
        )}
        {drawer && <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setDrawer(false)} />}

        {/* Right: reading cards */}
        <main ref={readerRef} className="reader-area min-w-0 space-y-6 pb-8">
          {hasVols && (
            <div className="px-2 pt-1">
              <p className="c-accent text-sm font-semibold">Volume {current.n}</p>
              <p className="c-muted text-sm">{current.chapters.length} chapters</p>
            </div>
          )}
          {current.chapters.map((c) => (
            <article key={c.id} id={`ch-${c.id}`} data-id={c.id} className="chapter-card card px-5 py-8 sm:px-10 sm:py-10">
              <header className="bd-line mb-2 space-y-1 border-b pb-6 text-center">
                <p className="c-gold text-xs font-semibold tracking-[.2em] uppercase">Chapter {c.n}</p>
                <div><Titles ch={c} lang="all" big /></div>
              </header>
              {buildContent(book, c).map((b, i) => <BlockView key={i} block={b} />)}
              <ChapterNav flat={flat} id={c.id} onGo={jump} />
            </article>
          ))}
          {hasVols && (
            <div className="flex justify-between gap-3 pt-2">
              {vol > 1 ? <button onClick={() => openVolume(vol - 1)} className="card h-12 px-6 text-sm font-medium">‹ Volume {vol - 1}</button> : <span />}
              {vol < vols.length && (
                <button onClick={() => openVolume(vol + 1)} className="bg-lib-accent h-12 rounded-full px-6 text-sm font-medium text-white">Volume {vol + 1} ›</button>
              )}
            </div>
          )}
        </main>
      </div>

      {sel && (
        <button onPointerDown={(e) => e.preventDefault()} onClick={copySel}
          className="bg-lib-accent fixed z-[80] h-9 -translate-x-1/2 -translate-y-full rounded-full px-4 text-xs font-medium text-white shadow-xl"
          style={{ left: sel.x, top: sel.y }}>{copied ? "Copied" : "Copy with reference"}</button>
      )}
      <button onClick={() => setDrawer(true)}
        className={`bg-lib-accent fixed bottom-5 left-1/2 z-40 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full px-6 text-sm font-medium text-white shadow-xl lg:hidden ${focus ? "hidden" : ""}`}>
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" /></svg> Contents
      </button>
    </div>
  )
}

function ChapterNav({ flat, id, onGo }: { flat: { vol: number; c: Chapter }[]; id: string; onGo: (v: number, id: string) => void }) {
  const i = flat.findIndex((f) => f.c.id === id)
  const prev = flat[i - 1]
  const next = flat[i + 1]
  return (
    <nav className="bd-line mt-8 flex justify-between gap-3 border-t pt-6" aria-label="Chapter navigation">
      {prev ? <button onClick={() => onGo(prev.vol, prev.c.id)} className="bg-lib-bg h-11 min-w-0 rounded-full px-5 text-sm font-medium"><span className="block max-w-[38vw] truncate">‹ {prev.c.en}</span></button> : <span />}
      {next && <button onClick={() => onGo(next.vol, next.c.id)} className="bg-lib-accent h-11 min-w-0 rounded-full px-5 text-sm font-medium text-white"><span className="block max-w-[38vw] truncate">{next.c.en} ›</span></button>}
    </nav>
  )
}
