"use client"

import Link from "next/link"
import { useEffect } from "react"
import { titleOf } from "@/lib/types"
import { ChapterTitles } from "./chapter-titles"
import { clip, href, useSetCurrentChapter, type Meta } from "./reader"

/** The right column for ONE chapter. It registers the chapter with the persistent reader shell (toolbar, contents). */
export function ChapterArticle({ book, chapter, part = 1, children }: { book: string; chapter: Meta; part?: number; children: React.ReactNode }) {
  const setCurrent = useSetCurrentChapter()
  useEffect(() => { setCurrent?.({ chapter, part }) }, [setCurrent, chapter, part])
  const { prev, next, volume } = chapter
  const crumbs = chapter.breadcrumb.filter((b) => b.slug !== chapter.slug)
  return (
    <article className="chapter-card card px-5 py-8 sm:px-10 sm:py-10">
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
      <nav className="bd-line mt-8 flex justify-between gap-3 border-t pt-6" aria-label="Chapter navigation">
        {prev ? <Link href={href(book, prev.slug)} className="bg-lib-bg inline-flex min-h-12 min-w-0 items-center rounded-full px-5 py-1.5 text-sm font-medium"><span className="flex flex-col items-start leading-tight"><span className="text-xs opacity-70">‹ Previous</span><span dir="rtl" className="block">{clip(titleOf(prev))}</span></span></Link> : <span />}
        {next && <Link href={href(book, next.slug)} className="bg-lib-accent inline-flex min-h-12 min-w-0 items-center rounded-full px-5 py-1.5 text-sm font-medium text-white"><span className="flex flex-col items-end leading-tight"><span className="text-xs opacity-80">Next ›</span><span dir="rtl" className="block">{clip(titleOf(next))}</span></span></Link>}
      </nav>
    </article>
  )
}
