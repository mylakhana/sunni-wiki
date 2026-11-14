"use client"

import Link from "next/link"
import { chapterHref } from "@/lib/store"
import type { Book } from "@/lib/types"
import { useLastRead } from "./use-last-read"

/** `books` is the cached library list: the saved book must still exist to be shown. */
export function ContinueReading({ books }: { books: Pick<Book, "id" | "title" | "hue">[] }) {
  const last = useLastRead()
  const b = last && books.find((x) => x.id === last.book)
  if (!last || !b) return null

  return (
    <section className="mb-12">
      <Link href={chapterHref(last)} className="card mx-auto flex max-w-xl items-center gap-4 p-4 transition hover:-translate-y-0.5">
        <span className="h-16 w-12 shrink-0 rounded-sm" style={{ background: `linear-gradient(145deg,${b.hue[0]},${b.hue[1]})` }} />
        <span className="min-w-0 flex-1">
          <span className="c-accent block text-xs tracking-wider uppercase">Continue reading</span>
          <span className="block font-semibold">{b.title}</span>
          {last.title && <span className="c-muted block truncate text-sm">{last.title}</span>}
        </span>
        <span className="c-muted">›</span>
      </Link>
    </section>
  )
}
