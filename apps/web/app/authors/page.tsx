import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { AuthorAvatar } from "@/components/library/author-avatar"
import { EmptyState, libraryDown } from "@/components/library/empty-state"
import { SiteFooter } from "@/components/library/site-footer"
import { loadLibrary } from "@/lib/api/library"

const description = "Scholars whose books you can read here."
export const metadata: Metadata = { title: "Writers", description, openGraph: { title: "Writers", description } }

async function AuthorList() {
  const { authors, error } = await loadLibrary()
  if (error) return <EmptyState {...libraryDown} />
  if (!authors.length) return <EmptyState title="No writers yet" />
  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {authors.map((w) => (
        <Link key={w.id} href={`/authors/${w.id}`} className="card flex items-center gap-4 p-5 transition hover:-translate-y-0.5">
          <AuthorAvatar author={w} size={64} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{w.name}</span>
            {w.ar && <span className="font-ar c-muted block text-lg" dir="rtl">{w.ar}</span>}
            <span className="c-accent mt-1 block text-xs">{w.bookCount} {w.bookCount === 1 ? "book" : "books"}</span>
          </span>
        </Link>
      ))}
    </div>
  )
}

export default function AuthorsPage() {
  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        <h1 className="text-4xl font-semibold tracking-tight">Writers</h1>
        <p className="c-muted mt-2">Scholars whose books you can read here.</p>
        <Suspense fallback={<div className="mt-10 grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading writers">{Array.from({ length: 6 }, (_, i) => <div key={i} className="card h-28" />)}</div>}>
          <AuthorList />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  )
}
