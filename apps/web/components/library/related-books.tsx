import { BookGrid } from "./book-card"
import { BOOKS, getAuthor } from "@/lib/data"

/** More books by the same author (excluding the current one). */
export function RelatedBooks({ authorId, excludeId }: { authorId: string; excludeId?: string }) {
  const books = BOOKS.filter((b) => b.author === authorId && b.id !== excludeId)
  if (!books.length) return null
  return (
    <section className="mx-auto mt-14 max-w-6xl px-4 sm:px-6">
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">More by {getAuthor(authorId)?.name}</h2>
      <BookGrid books={books} />
    </section>
  )
}
