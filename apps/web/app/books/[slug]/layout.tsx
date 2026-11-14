import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ReaderShell } from "@/components/library/reader"
import { SiteFooter } from "@/components/library/site-footer"
import { getBook } from "@/lib/api/library"

async function Shell({ params, children }: { params: Promise<{ slug: string }>; children: React.ReactNode }) {
  const { slug } = await params
  const book = await getBook(slug)
  if (!book) notFound()
  // The shell (toolbar, contents, preferences) lives here, so changing chapter only swaps `children`.
  return <ReaderShell book={book}>{children}</ReaderShell>
}

export default function BookLayout({ params, children }: { params: Promise<{ slug: string }>; children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6"><div className="card h-80 animate-pulse" role="status" aria-label="Loading book" /></main>}>
        <Shell params={params}>{children}</Shell>
      </Suspense>
      <SiteFooter />
    </>
  )
}
