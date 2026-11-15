import type { Metadata } from "next"
import { Suspense } from "react"
import { AuthorSearchList } from "@/components/library/list-search"
import { EmptyState, libraryDown } from "@/components/library/empty-state"
import { SiteFooter } from "@/components/library/site-footer"
import { loadLibrary } from "@/lib/api/library"

const description = "Scholars whose books you can read here."
export const metadata: Metadata = { title: "Writers", description, openGraph: { title: "Writers", description } }

async function AuthorList() {
  const { authors, error } = await loadLibrary()
  if (error) return <EmptyState {...libraryDown} />
  if (!authors.length) return <EmptyState title="No writers yet" />
  return <AuthorSearchList authors={authors} />
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
