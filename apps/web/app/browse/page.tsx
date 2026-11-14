import type { Metadata } from "next"
import { Suspense } from "react"
import { BrowseSkeleton, BrowseView } from "@/components/library/browse-view"
import { SiteFooter } from "@/components/library/site-footer"

export const metadata: Metadata = { title: "Browse" }

export default function BrowsePage() {
  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        <h1 className="text-4xl font-semibold tracking-tight">Browse books</h1>
        <p className="c-muted mt-2">Choose a topic, a writer, or the language you read.</p>
        <Suspense fallback={<BrowseSkeleton />}>
          <BrowseView />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  )
}
