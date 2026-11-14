"use client"

import { useLastRead } from "./use-last-read"

/** Small "Continue reading" hint on a book card; renders nothing unless this was the last book read. */
export function ProgressBar({ book }: { book: { id: string } }) {
  const last = useLastRead()
  if (last?.book !== book.id) return null
  return <p className="c-accent mt-2 text-xs font-medium">In progress · continue reading</p>
}
