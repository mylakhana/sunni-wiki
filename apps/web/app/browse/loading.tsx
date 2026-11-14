import { BrowseSkeleton } from "@/components/library/browse-view"

export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6" aria-busy="true">
      <h1 className="text-4xl font-semibold tracking-tight">Browse books</h1>
      <p className="c-muted mt-2">Choose a topic, a writer, or the language you read.</p>
      <BrowseSkeleton />
    </main>
  )
}
