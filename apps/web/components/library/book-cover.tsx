import { authorOf, type Book } from "@/lib/data"

export function BookCover({ book }: { book: Book }) {
  return (
    <div className="cover" style={{ "--c1": book.hue[0], "--c2": book.hue[1] } as React.CSSProperties}>
      <div className="cover-body">
        <div className="cover-sm">{authorOf(book).name.split(" ").slice(-2).join(" ")}</div>
        <div className="cover-line" />
        <div className="cover-ar" dir="rtl">{book.ar}</div>
        <div className="cover-line" />
      </div>
    </div>
  )
}
