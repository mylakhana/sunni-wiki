import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { ChapterArticle } from "@/components/library/chapter-article"
import { getBook, getChapter } from "@/lib/api/library"
import { ChapterStream } from "@/components/library/chapter-stream"
import { isLongTei, partOfAnchor, TeiContent } from "@/lib/tei/render"
import { titleOf } from "@/lib/types"

type Props = {
  params: Promise<{ slug: string; chapter: string }>
  searchParams: Promise<{ part?: string | string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, chapter } = await params
  const [b, c] = await Promise.all([getBook(slug).catch(() => null), getChapter(slug, chapter).catch(() => null)])
  if (!b || !c) return { title: "Book" }
  const title = b.title
  const description = `Read ${titleOf(c)} from ${b.title} by ${b.authorName}.`
  return { title, description, openGraph: { title, description, type: "article" }, twitter: { card: "summary", title, description } }
}

async function ChapterView({ params, searchParams }: Props) {
  const { slug, chapter: chapterSlug } = await params
  const rawPart = (await searchParams).part
  const part = Math.max(1, Number.parseInt(Array.isArray(rawPart) ? rawPart[0]! : (rawPart ?? "1"), 10) || 1)
  const [book, chapter] = await Promise.all([getBook(slug), getChapter(slug, chapterSlug)])
  if (!book || !chapter) notFound()

  // Groups (level 0) and sub-topics (level 2) have no text of their own: send the reader to the chapter that does.
  if (chapter.redirect) {
    const { slug: target, anchorId } = chapter.redirect
    let query = ""
    if (anchorId) {
      const t = await getChapter(slug, target)
      const p = t?.tei ? partOfAnchor(t.tei, anchorId) : 1
      if (p > 1) query = `?part=${p}`
    }
    redirect(`/books/${encodeURIComponent(slug)}/${encodeURIComponent(target)}${query}${anchorId ? `#${anchorId}` : ""}`)
  }
  if (chapter.level === 0) notFound() // a group without any chapter
  // The (up to ~2 MB) TEI stays on the server: only the rendered tree is streamed, never sent to the client component as data.
  const { tei, ...meta } = chapter

  return (
    <>
    <ChapterArticle book={book.id} bookTitle={book.title} authorName={book.authorName} chapter={meta} part={part} plain={!isLongTei(tei ?? "")}>
      {tei && tei.trim() ? (
        <TeiContent tei={tei} part={part} book={slug} chapter={chapterSlug} titles={[meta.ur, meta.ar, meta.en].filter((x): x is string => !!x)} />
      ) : (
        <p className="blk-note">This section has no text of its own. Choose a sub-section from the contents.</p>
      )}
    </ChapterArticle>
    <ChapterStream book={book.id} bookTitle={book.title} authorName={book.authorName} current={meta.slug} from={meta.next?.slug ?? null} />
    </>
  )
}

export default function ChapterPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="card h-[70vh] animate-pulse" role="status" aria-label="Loading chapter" />}>
      <ChapterView params={params} searchParams={searchParams} />
    </Suspense>
  )
}
