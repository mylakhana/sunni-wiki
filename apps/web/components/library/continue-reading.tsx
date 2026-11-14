"use client"

import Link from "next/link"
import { useSyncExternalStore } from "react"
import { buildVolumes, getBook } from "@/lib/data"
import { lastReadStore, type LastRead } from "@/lib/store"

export function ContinueReading() {
  const raw = useSyncExternalStore(lastReadStore.subscribe, lastReadStore.getSnapshot, lastReadStore.getServerSnapshot)
  if (!raw) return null
  let last: LastRead
  try {
    last = JSON.parse(raw)
  } catch {
    return null
  }
  const b = getBook(last.book)
  if (!b) return null

  const vols = buildVolumes(b)
  const total = vols.reduce((n, v) => n + v.chapters.length, 0)
  const before = vols.filter((v) => v.n < last.vol).reduce((n, v) => n + v.chapters.length, 0)
  const done = Math.min(total, before + last.n)
  const pct = total ? Math.round((done / total) * 100) : 0

  return (
    <section className="mb-12">
      <Link
        href={`/books/${b.id}?vol=${last.vol}#ch-${last.ch}`}
        className="card mx-auto flex max-w-xl items-center gap-4 p-4 transition hover:-translate-y-0.5"
      >
        <span className="h-16 w-12 shrink-0 rounded-sm" style={{ background: `linear-gradient(145deg,${b.hue[0]},${b.hue[1]})` }} />
        <span className="flex-1">
          <span className="c-accent block text-xs tracking-wider uppercase">Continue reading</span>
          <span className="block font-semibold">{b.title}</span>
          <span className="c-muted block text-sm">{b.volumes ? `Volume ${last.vol} · ` : ""}Chapter {last.n}</span>
          <span className="mt-2 flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/15" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Reading progress">
              <span className="bg-lib-accent block h-full rounded-full" style={{ width: `${pct}%` }} />
            </span>
            <span className="c-muted text-xs tabular-nums">{pct}%</span>
          </span>
        </span>
        <span className="c-muted">›</span>
      </Link>
    </section>
  )
}
