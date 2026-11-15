"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** Share a selected passage as a deep link (?part&q[&e]#anchor) that re-highlights the text on load. */

const MAX_Q = 80 // longer selections store only their start and end
const EDGE = 40
// Harakat / Quranic marks / tatweel are ignored when matching, so Arabic and Urdu survive diacritic differences.
const IGNORE = /[ـً-ٰٟۖ-ۭ​-‏]/
const norm = (s: string) => s.replace(/\s+/g, " ").trim()

/** Normalised text of `root` plus, per char, the source text node and offset. */
function index(root: Element) {
  let text = ""
  const map: { node: Text; off: number }[] = []
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let prevSpace = true
  for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
    const s = n.data
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]!
      if (IGNORE.test(ch)) continue
      if (/\s/.test(ch)) {
        if (prevSpace) continue
        prevSpace = true
        text += " "
      } else {
        prevSpace = false
        text += ch
      }
      map.push({ node: n, off: i })
    }
  }
  return { text, map }
}
const strip = (s: string) => norm(s).split("").filter((c) => !IGNORE.test(c)).join("")

function findRange(root: Element, q: string, e: string | null): Range | null {
  const { text, map } = index(root)
  const qs = strip(q)
  if (!qs) return null
  const a = text.indexOf(qs)
  if (a < 0) return null
  let end = a + qs.length
  if (e) {
    const es = strip(e)
    const b = text.indexOf(es, end)
    if (b >= 0) end = b + es.length
  }
  const s = map[a], t = map[end - 1]
  if (!s || !t) return null
  const r = document.createRange()
  r.setStart(s.node, s.off)
  r.setEnd(t.node, t.off + 1)
  return r
}

/** Re-apply a shared highlight (and scroll to it) when the URL carries ?q. */
function useSharedHighlight(root: () => Element | null) {
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    const q = p.get("q")
    if (!q || typeof CSS === "undefined" || !("highlights" in CSS)) return
    const e = p.get("e")
    let done = false
    const run = () => {
      const el = root()
      if (done || !el) return
      const r = findRange(el, q, e)
      if (!r) return
      done = true
      CSS.highlights.set("shared-quote", new Highlight(r))
      r.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" })
    }
    const timers = [0, 400, 1200, 2500].map((ms) => setTimeout(run, ms))
    // any tap/keypress clears the highlight
    const clear = () => CSS.highlights.delete("shared-quote")
    const off = setTimeout(() => addEventListener("pointerdown", clear, { once: true }), 1500)
    return () => { timers.forEach(clearTimeout); clearTimeout(off); removeEventListener("pointerdown", clear); clear() }
  }, [root])
}

type Sel = { text: string; rect: DOMRect; anchor: string | null; q: string; e: string | null }

export function ShareSelection({ bookTitle, authorName, chapterTitle, part }: { bookTitle: string; authorName: string; chapterTitle: string; part: number }) {
  const [sel, setSel] = useState<Sel | null>(null)
  const [mobile, setMobile] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastT = useRef<ReturnType<typeof setTimeout>>(undefined)
  // this instance's own chapter card (several chapters can be on the page when the next one is streamed in below)
  const marker = useRef<HTMLSpanElement>(null)
  const article = useCallback(() => marker.current?.closest(".chapter-card") ?? null, [])
  useSharedHighlight(article)

  useEffect(() => {
    const mq = matchMedia("(max-width: 767px), (pointer: coarse)")
    const upd = () => setMobile(mq.matches)
    upd(); mq.addEventListener("change", upd)
    return () => mq.removeEventListener("change", upd)
  }, [])

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const read = () => {
      const s = getSelection()
      const root = article()
      if (!s || s.isCollapsed || s.rangeCount === 0 || !root) return setSel(null)
      const r = s.getRangeAt(0)
      const text = norm(s.toString())
      if (text.length < 3 || !root.contains(r.commonAncestorContainer) || (r.commonAncestorContainer as Element).closest?.("nav,header")) return setSel(null)
      // nearest anchor id at or before the selection start
      let anchor: string | null = null
      for (const a of root.querySelectorAll<HTMLElement>(".tei-anchor")) {
        const pos = a.compareDocumentPosition(r.startContainer)
        if (a === r.startContainer || pos & Node.DOCUMENT_POSITION_FOLLOWING) anchor = a.id
        else break
      }
      const long = text.length > MAX_Q
      setSel({ text, rect: r.getBoundingClientRect(), anchor, q: long ? text.slice(0, EDGE) : text, e: long ? text.slice(-EDGE) : null })
    }
    // debounce: mobile fires selectionchange continuously while dragging handles
    const on = () => { clearTimeout(t); t = setTimeout(read, 200) }
    document.addEventListener("selectionchange", on)
    return () => { document.removeEventListener("selectionchange", on); clearTimeout(t) }
  }, [article])

  const flash = (m: string) => {
    setToast(m); clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(null), 2000)
  }
  const link = (s: Sel) => {
    const u = new URL(location.pathname, location.origin)
    if (part > 1) u.searchParams.set("part", String(part))
    u.searchParams.set("q", s.q)
    if (s.e) u.searchParams.set("e", s.e)
    if (s.anchor) u.hash = s.anchor
    return u.toString()
  }
  const cite = `— ${authorName}, ${bookTitle} · ${chapterTitle}`
  const copy = async (v: string, ok: string) => {
    try { await navigator.clipboard.writeText(v); flash(ok) } catch { flash("Copy failed") }
  }
  const done = () => { getSelection()?.removeAllRanges(); setSel(null) }

  const btn = "min-h-10 rounded-full px-3.5 text-sm font-medium whitespace-nowrap"
  const bar = sel && (
    <div
      role="toolbar" aria-label="Share selection"
      onMouseDown={(e) => e.preventDefault()} onPointerDown={(e) => e.preventDefault()}
      className="bg-lib-bg bd-line fixed z-50 flex items-center gap-1 rounded-full border p-1 shadow-lg"
      style={mobile
        ? { left: "50%", transform: "translateX(-50%)", bottom: "max(1rem, env(safe-area-inset-bottom))" }
        : { left: Math.min(Math.max(sel.rect.left + sel.rect.width / 2, 130), innerWidth - 130), top: Math.max(sel.rect.top - 52, 64), transform: "translateX(-50%)" }}
    >
      <button className={btn} onClick={() => { void copy(`${sel.text}\n${cite}`, "Copied"); done() }}>Copy</button>
      <button className={btn} onClick={() => { void copy(link(sel), "Link copied"); done() }}>Copy link</button>
      {typeof navigator !== "undefined" && "share" in navigator && (
        <button className={`${btn} bg-lib-accent text-(--lib-bg)`} onClick={() => {
          navigator.share({ title: `${chapterTitle} · ${bookTitle}`, text: `${sel.text}\n${cite}`, url: link(sel) }).catch(() => {})
          done()
        }}>Share</button>
      )}
    </div>
  )
  return (
    <>
      <span ref={marker} hidden />
      {bar}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center">
        {toast && <span className="rounded-full bg-black/80 px-4 py-2 text-sm text-white">{toast}</span>}
      </div>
    </>
  )
}
