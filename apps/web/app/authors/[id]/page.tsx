import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AuthorAvatar } from "@/components/library/author-avatar"
import { BookGrid } from "@/components/library/book-card"
import { SiteFooter } from "@/components/library/site-footer"
import { RelatedBooks } from "@/components/library/related-books"
import { AUTHORS, booksByAuthor, getAuthor } from "@/lib/data"

type Props = { params: Promise<{ id: string }> }

export const generateStaticParams = () => AUTHORS.map((a) => ({ id: a.id }))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = getAuthor((await params).id)
  if (!a) return { title: "Writer" }
  const description = a.bio.slice(0, 160)
  return {
    title: a.name,
    description,
    openGraph: { title: a.name, description, type: "profile" },
    twitter: { card: "summary", title: a.name, description },
  }
}

export default async function AuthorPage({ params }: Props) {
  const a = getAuthor((await params).id)
  if (!a) notFound()

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        <Link href="/authors" className="c-accent text-sm">‹ All writers</Link>
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
          <AuthorAvatar author={a} size={104} />
          <div>
            <h1 className="text-4xl font-semibold tracking-tight">{a.name}</h1>
            <p className="font-ar c-gold mt-1 text-2xl" dir="rtl">{a.ar}</p>
            <p className="c-muted mt-1 text-sm">{a.years} CE</p>
          </div>
        </div>
        <p className="c-muted mt-6 max-w-2xl text-lg leading-relaxed">{a.bio}</p>
        <h2 className="mt-14 mb-6 text-2xl font-semibold tracking-tight">Books by {a.name}</h2>
        <BookGrid books={booksByAuthor(a.id)} />
      </main>
      <SiteFooter />
    </>
  )
}
