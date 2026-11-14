import Link from "next/link"
import { authorOf, type Book } from "@/lib/data"
import { BookCover } from "./book-cover"
import { ProgressBar } from "./book-progress"

export function BookCard({ book }: { book: Book }) {
  return (
    <Link href={`/books/${book.id}`} className="book-link group block">
      <BookCover book={book} />
      <h3 className="mt-4 text-[15px] font-semibold leading-snug">{book.title}</h3>
      <p className="c-muted mt-0.5 text-sm">{authorOf(book).name}</p>
      <ProgressBar book={book} />
    </Link>
  )
}

export function BookGrid({ books }: { books: Book[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
      {books.map((b) => <BookCard key={b.id} book={b} />)}
    </div>
  )
}
