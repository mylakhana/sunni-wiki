"use client"

import { startTransition, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { loadNextChapter } from "@/lib/tei/next-chapter-action"

/**
 * Forward-only infinite reading: when the end of the last chapter on screen nears, the next chapter is fetched
 * (server-rendered) and appended below. Earlier chapters stay mounted (see ChapterArticle for how far-away ones are
 * made cheap); there is no prepend, "Previous" is a normal jump.
 */
export function ChapterStream({ book, bookTitle, authorName, current, from }: { book: string; bookTitle: string; authorName: string; current: string; from: string | null }) {
  const [items, setItems] = useState<ReactNode[]>([])
  const [next, setNext] = useState<string | null>(from)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const seen = useRef<string[]>([current])
  const ref = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)

  const load = useCallback(async () => {
    if (busyRef.current || !next) return
    busyRef.current = true
    setBusy(true)
    setError(false)
    try {
      const r = await loadNextChapter(book, bookTitle, authorName, next, seen.current)
      if ("error" in r) throw new Error("next chapter failed")
      if ("done" in r) { setNext(null); return }
      seen.current = [...seen.current, r.slug]
      // Transition + own Suspense: if the new chapter's flight data is still streaming, React keeps what is on screen
      // instead of hiding everything under the nearest boundary.
      startTransition(() => {
        setItems((o) => [...o, <Suspense key={r.slug} fallback={<div className="card mt-10 h-40 animate-pulse" role="status" aria-label="Loading next chapter" />}>{r.node}</Suspense>])
        setNext(r.next)
      })
    } catch {
      setError(true)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [book, bookTitle, authorName, next])

  useEffect(() => {
    const el = ref.current
    if (!el || !next || error || busy) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const tryLoad = () => {
      // the chapter above may still be appending its own parts: wait until those are in
      if (el.previousElementSibling?.querySelector("[data-lazy-parts]")) { timer = setTimeout(tryLoad, 300); return }
      void load()
    }
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) { io.disconnect(); tryLoad() } }, { rootMargin: "900px 0px" })
    io.observe(el)
    return () => { io.disconnect(); clearTimeout(timer) }
  }, [load, next, error, busy, items.length])

  return (
    <>
      {items}
      <div ref={ref} className="min-h-6 py-4 text-center text-xs" aria-live="polite">
        {error ? <button className="c-accent font-medium" onClick={() => void load()}>Could not load the next chapter. Try again</button>
          : busy ? <span className="c-muted" role="status">Loading next chapter…</span> : null}
      </div>
    </>
  )
}
