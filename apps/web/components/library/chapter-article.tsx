"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { titleOf } from "@/lib/types"
import { ShareSelection } from "./share-selection"
import { ChapterTitles } from "./chapter-titles"
import { clip, href, useSetCurrentChapter, type Meta } from "./reader"

/** The right column for ONE chapter. It registers the chapter with the persistent reader shell (toolbar, contents). */
export function ChapterArticle({ book, bookTitle, authorName, chapter, part = 1, streamed = false, plain = false, children }: { book: string; bookTitle: string; authorName: string; chapter: Meta; part?: number; streamed?: boolean; plain?: boolean; children: React.ReactNode }) {
  const setCurrent = useSetCurrentChapter()
  const ref = useRef<HTMLElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const height = useRef(0)
  // the page's own chapter registers on mount; streamed ones only when they scroll into view (below)
  useEffect(() => { if (!streamed) setCurrent?.({ chapter, part }) }, [setCurrent, chapter, part, streamed])
  // The chapter crossing a thin band near the top of the viewport is "the one being read": toolbar, contents, Ask AI and
  // the address bar follow it (replaceState: no history entry per chapter).
  useEffect(() => {
    const el = ref.current
    if (!el || !setCurrent) return
    const io = new IntersectionObserver((e) => {
      if (!e[0]?.isIntersecting) return
      setCurrent({ chapter, part: 1, scroll: true })
      const url = href(book, chapter.slug)
      // The NATIVE replaceState on purpose: Next patches history.replaceState on the instance to sync its router, which
      // re-renders the page (blank chapters, scroll reset). Only the address bar should change here.
      if (location.pathname !== url) { try { History.prototype.replaceState.call(history, history.state, "", url) } catch {} }
    }, { rootMargin: "-30% 0px -69% 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [setCurrent, chapter, book, bookTitle])
  // Far from the viewport a chapter costs nothing: short ones are unmounted (height kept), long ones (which hold
  // lazily appended parts that must not be lost) are only hidden with content-visibility.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting) setCollapsed(false)
      else { height.current = el.offsetHeight; setCollapsed(true) }
    }, { rootMargin: "3000px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const hidden = collapsed && height.current > 0
  const { prev, next, volume } = chapter
  const crumbs = chapter.breadcrumb.filter((b) => b.slug !== chapter.slug)
  return (
    <article ref={ref} data-chapter={chapter.slug} className="chapter-card card px-5 py-8 sm:px-10 sm:py-10"
      style={hidden ? { height: height.current, overflow: "hidden", contentVisibility: plain ? undefined : "hidden" } : undefined}>
      {hidden && plain ? null : <>
      <header className="bd-line mb-2 space-y-1 border-b pb-6 text-center">
        {(crumbs.length > 0 || volume) && (
          <nav aria-label="Breadcrumb" className="c-gold text-[.75em] font-semibold tracking-[.12em] uppercase">
            {volume && <span>{titleOf(volume, "Volume")}</span>}
            {crumbs.map((b, i) => (
              <span key={b.id}>
                {(volume || i > 0) && " › "}
                {b.level === 0 ? <span>{titleOf(b)}</span> /* group title: not a page */ : <Link href={href(book, b.slug)} className="hover:underline">{titleOf(b)}</Link>}
              </span>
            ))}
          </nav>
        )}
        <div className="pt-2"><ChapterTitles t={chapter} big /></div>
      </header>
      {children}
      <ShareSelection bookTitle={bookTitle} authorName={authorName} chapterTitle={titleOf(chapter)} part={part} />
      <nav className="bd-line mt-8 flex justify-between gap-3 border-t pt-6" aria-label="Chapter navigation">
        {prev ? <Link href={href(book, prev.slug)} className="bg-lib-bg inline-flex min-h-12 min-w-0 items-center rounded-full px-5 py-1.5 text-sm font-medium"><span className="flex flex-col items-start leading-tight"><span className="text-xs opacity-70">‹ Previous</span><span dir="rtl" className="block">{clip(titleOf(prev))}</span></span></Link> : <span />}
        {next && <Link href={href(book, next.slug)} className="bg-lib-accent inline-flex min-h-12 min-w-0 items-center rounded-full px-5 py-1.5 text-sm font-medium text-(--lib-bg)"><span className="flex flex-col items-end leading-tight"><span className="text-xs opacity-80">Next ›</span><span dir="rtl" className="block">{clip(titleOf(next))}</span></span></Link>}
      </nav>
      </>}
    </article>
  )
}
