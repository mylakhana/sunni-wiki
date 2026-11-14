import type { Book } from "@/lib/types"

/** Real cover image when the API has one, otherwise a gradient cover derived from the slug. */
export function BookCover({ book }: { book: Book }) {
  if (book.cover) {
    return (
      <div className="cover">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={book.cover} alt={`Cover of ${book.title}`} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      </div>
    )
  }
  return (
    <div className="cover" style={{ "--c1": book.hue[0], "--c2": book.hue[1] } as React.CSSProperties}>
      <div className="cover-body">
        <div className="cover-sm">{book.authorName.split(" ").slice(-2).join(" ")}</div>
        <div className="cover-line" />
        {book.ar ? <div className="cover-ar" dir="rtl">{book.ar}</div> : <div className="cover-sm">{book.title}</div>}
        <div className="cover-line" />
      </div>
    </div>
  )
}
