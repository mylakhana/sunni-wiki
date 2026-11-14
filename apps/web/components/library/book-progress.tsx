"use client"

import Link from "next/link"
import { useSyncExternalStore } from "react"
import { buildVolumes, type Book } from "@/lib/data"
import { lastReadStore, type LastRead } from "@/lib/store"

function useLast(bookId: string): LastRead | null {
  const raw = useSyncExternalStore(lastReadStore.subscribe, lastReadStore.getSnapshot, lastReadStore.getServerSnapshot)
  if (!raw) return null
  try {
    const l = JSON.parse(raw) as LastRead
    return l.book === bookId ? l : null
  } catch {
    return null
  }
}

function totalChapters(book: Book) {
  return buildVolumes(book).reduce((s, v) => s + v.chapters.length, 0)
}

/** Slim progress bar for a book card; renders nothing if the book was not the last one read. */
export function ProgressBar({ book }: { book: Book }) {
  const last = useLast(book.id)
  if (!last) return null
  const total = totalChapters(book) || 1
  const pct = Math.min(100, Math.round((last.n / total) * 100))
  return (
    <div className="mt-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Reading progress">
      <div className="h-1 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, currentColor 15%, transparent)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent, #0f766e)" }} />
      </div>
    </div>
  )
}

/** Primary "Start reading" / "Resume" action. Intended for the book page (reader agent can import it). */
export function ReadButton({ book }: { book: Book }) {
  const last = useLast(book.id)
  const href = last ? `/books/${book.id}?vol=${last.vol}#ch-${last.ch}` : `/books/${book.id}`
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white"
      style={{ background: "var(--accent, #0f766e)" }}
    >
      {last ? `Resume · Chapter ${last.n}` : "Start reading"}
    </Link>
  )
}
