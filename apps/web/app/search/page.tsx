import type { Metadata } from "next"
import { Suspense } from "react"
import { EmptyState, libraryDown } from "@/components/library/empty-state"
import { SearchForm } from "@/components/library/search-form"
import { SearchResults, SearchResultsSkeleton, type FacetNames } from "@/components/library/search-results"
import { SiteFooter } from "@/components/library/site-footer"
import { loadLibrary } from "@/lib/api/library"
import { parseSearchState } from "@/lib/search-params"

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = parseSearchState(await searchParams)
  return { title: q ? `Search: ${q}` : "Search in books", robots: { index: false } }
}

const Heading = () => (
  <>
    <h1 className="text-4xl font-semibold tracking-tight">Search in books</h1>
    <p className="c-muted mt-2">Find words and phrases inside the text of every book.</p>
  </>
)

async function SearchBody({ searchParams }: Props) {
  const state = parseSearchState(await searchParams)
  const lib = await loadLibrary()
  if (lib.error) return <EmptyState {...libraryDown} />
  const scope = {
    books: lib.books.map((b) => ({ value: String(b.dbId), label: b.title })),
    authors: lib.authors.map((a) => ({ value: String(a.dbId), label: a.name })),
    categories: lib.categories.map((c) => ({ value: String(c.dbId), label: c.en })),
  }
  const names: FacetNames = {
    books: new Map(lib.books.map((b) => [b.dbId, b.title])),
    authors: new Map(lib.authors.map((a) => [a.dbId, a.name])),
    categories: new Map(lib.categories.map((c) => [c.dbId, c.en])),
  }
  return (
    <>
      <SearchForm state={state} scope={scope} />
      <Suspense key={JSON.stringify(state)} fallback={<SearchResultsSkeleton />}>
        <SearchResults state={state} names={names} />
      </Suspense>
    </>
  )
}

export default function SearchPage({ searchParams }: Props) {
  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        <Heading />
        <Suspense fallback={<SearchResultsSkeleton />}>
          <SearchBody searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  )
}
