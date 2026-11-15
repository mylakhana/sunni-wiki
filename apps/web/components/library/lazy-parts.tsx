"use client"

import { startTransition, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { loadChapterPart } from "@/lib/tei/parts-action"

/**
 * Continues a long chapter: when the reader scrolls near the end, the next part is fetched (server-rendered)
 * and appended, which in turn mounts the next sentinel. Nothing about "parts" is shown to the reader.
 */
export function LazyParts({ book, chapter, next }: { book: string; chapter: string; next: number }) {
  const [loaded, setLoaded] = useState<ReactNode | null>(null)
  const [more, setMore] = useState(true) // false once the last part was appended
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  const load = useCallback(async () => {
    if (started.current) return
    started.current = true
    setBusy(true)
    setError(false)
    try {
      const r = await loadChapterPart(book, chapter, next)
      if ("error" in r) throw new Error("part failed")
      startTransition(() => { setLoaded(<Suspense fallback={null}>{r.node}</Suspense>); setMore(r.hasMore) })
    } catch {
      started.current = false
      setError(true)
    } finally {
      setBusy(false)
    }
  }, [book, chapter, next])

  useEffect(() => {
    const el = ref.current
    if (!el || loaded || error) return
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) { io.disconnect(); void load() } }, { rootMargin: "1200px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [load, loaded, error])

  return (
    <>
      {loaded}
      {loaded && more && <LazyParts book={book} chapter={chapter} next={next + 1} />}
      {!loaded && (
        <div ref={ref} data-lazy-parts className="min-h-6 py-4 text-center text-xs" aria-live="polite">
          {error ? (
            <button className="c-accent font-medium" onClick={() => void load()}>Could not load the rest. Try again</button>
          ) : busy ? (
            <span className="c-muted" role="status">Loading…</span>
          ) : null}
        </div>
      )}
    </>
  )
}
