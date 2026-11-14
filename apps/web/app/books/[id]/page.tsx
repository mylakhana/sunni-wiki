import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Reader } from "@/components/library/reader"
import { RelatedBooks } from "@/components/library/related-books"
import { SiteFooter } from "@/components/library/site-footer"
import { BOOKS, getBook } from "@/lib/data"

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ vol?: string }> }

export const generateStaticParams = () => BOOKS.map((b) => ({ id: b.id }))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const b = getBook((await params).id)
  if (!b) return { title: "Book" }
  return {
    title: b.title,
    description: b.blurb,
    openGraph: { title: b.title, description: b.blurb, type: "book" },
    twitter: { card: "summary", title: b.title, description: b.blurb },
  }
}

export default async function BookPage({ params, searchParams }: Props) {
  const book = getBook((await params).id)
  if (!book) notFound()
  const { vol } = await searchParams

  return (
    <>
      <Reader book={book} initialVol={vol ? Number(vol) : null} />
      <RelatedBooks authorId={book.author} excludeId={book.id} />
      <SiteFooter />
    </>
  )
}
