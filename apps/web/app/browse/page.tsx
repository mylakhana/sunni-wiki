import type { Metadata } from "next"
import { Suspense } from "react"
import { BrowseSkeleton, BrowseView } from "@/components/library/browse-view"
import { EmptyState, libraryDown } from "@/components/library/empty-state"
import { SiteFooter } from "@/components/library/site-footer"
import { loadLibrary } from "@/lib/api/library"

export const metadata: Metadata = { title: "Browse" }

async function BrowseData() {
  const { books, authors, categories, error } = await loadLibrary()
  if (error) return <EmptyState {...libraryDown} />
  return <BrowseView books={books} authors={authors} categories={categories} />
}

export default function BrowsePage() {
  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        <h1 className="text-4xl font-semibold tracking-tight">Browse books</h1>
        <p className="c-muted mt-2">Choose a topic, a writer, or the language you read.</p>
        <Suspense fallback={<BrowseSkeleton />}>
          <BrowseData />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  )
}
