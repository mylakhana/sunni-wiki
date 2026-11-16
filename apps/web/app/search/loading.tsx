import { SearchResultsSkeleton } from "@/components/library/search-results"

export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6" aria-busy="true">
      <h1 className="text-4xl font-semibold tracking-tight">Search in books</h1>
      <p className="c-muted mt-2">Find words and phrases inside the text of every book.</p>
      <SearchResultsSkeleton />
    </main>
  )
}
