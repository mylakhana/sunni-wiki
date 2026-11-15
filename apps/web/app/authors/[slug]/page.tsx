import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { AuthorAvatar } from "@/components/library/author-avatar"
import { AuthorBookSearch } from "@/components/library/list-search"
import { EmptyState } from "@/components/library/empty-state"
import { SiteFooter } from "@/components/library/site-footer"
import { getAuthor, getLibraryForBuild } from "@/lib/api/library"

const PLACEHOLDER = "__placeholder__"
type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const { authors } = await getLibraryForBuild()
  // Cache Components needs at least one param; the placeholder resolves to a 404.
  return authors.length ? authors.map((a) => ({ slug: a.id })) : [{ slug: PLACEHOLDER }]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = slug === PLACEHOLDER ? null : await getAuthor(slug).catch(() => null)
  if (!data) return { title: "Writer" }
  const { author: a } = data
  const description = a.bio?.slice(0, 160) ?? `Books by ${a.name} on SunniWiki.`
  return {
    title: a.name,
    description,
    openGraph: { title: a.name, description, type: "profile" },
    twitter: { card: "summary_large_image", title: a.name, description },
  }
}

async function AuthorDetail({ params }: Props) {
  const { slug } = await params
  const data = slug === PLACEHOLDER ? null : await getAuthor(slug)
  if (!data) notFound()
  const { author: a, books } = data

  return (
    <>
      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
        <AuthorAvatar author={a} size={104} />
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{a.name}</h1>
          {a.ar && <p className="font-ar c-gold mt-1 text-2xl" dir="rtl">{a.ar}</p>}
          {a.years && <p className="c-muted mt-1 text-sm">{a.years} CE</p>}
        </div>
      </div>
      {a.bio && <p className="c-muted mt-6 max-w-2xl text-lg leading-relaxed">{a.bio}</p>}
      <h2 className="mt-14 mb-6 text-2xl font-semibold tracking-tight">Books by {a.name}</h2>
      {books.length ? <AuthorBookSearch books={books} /> : <EmptyState title="No books yet" text="This writer has no published books." />}
    </>
  )
}

export default function AuthorPage({ params }: Props) {
  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        <Link href="/authors" className="c-accent text-sm">‹ All writers</Link>
        <Suspense fallback={<div className="mt-6 h-40 animate-pulse" role="status" aria-label="Loading writer" />}>
          <AuthorDetail params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  )
}
