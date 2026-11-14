import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { getBook, getFirstChapterSlug, getLibraryForBuild } from "@/lib/api/library"

const PLACEHOLDER = "__placeholder__"
type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const { books } = await getLibraryForBuild()
  // Cache Components needs at least one param; the placeholder resolves to a 404.
  return books.length ? books.map((b) => ({ slug: b.id })) : [{ slug: PLACEHOLDER }]
}

/** A book has no landing page: /books/[slug] sends the reader to the first chapter of its first volume. */
async function OpenFirstChapter({ params }: Props) {
  const { slug } = await params
  const book = slug === PLACEHOLDER ? null : await getBook(slug)
  if (!book) notFound()
  const first = await getFirstChapterSlug(book)
  if (!first) notFound()
  return redirect(`/books/${encodeURIComponent(book.id)}/${encodeURIComponent(first)}`)
}

export default function BookPage({ params }: Props) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6"><div className="card h-80 animate-pulse" role="status" aria-label="Opening book" /></main>}>
      <OpenFirstChapter params={params} />
    </Suspense>
  )
}
