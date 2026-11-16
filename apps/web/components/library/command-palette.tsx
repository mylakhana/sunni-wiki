"use client"

import { useRouter } from "next/navigation"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { loadSearchIndex } from "@/lib/actions"
import type { SearchIndex } from "@/lib/types"
import { authorColor, initials } from "@/lib/ui"

type Item = { key: string; href: string; kind: "author" | "book" | "content"; title: string; sub?: string; color?: string; hue?: [string, string] }

let cached: SearchIndex | null = null

/** Loads the (server-cached) index when first opened, then filters it locally. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState<SearchIndex | null>(cached)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (cached) return
    let live = true
    loadSearchIndex()
      .then((i) => { cached = i; if (live) setIndex(i) })
      .catch(() => live && setFailed(true))
    return () => { live = false }
  }, [])
  if (!index) {
    return (
      <PaletteShell onClose={onClose}>
        <p className="c-muted px-3 py-6 text-center text-sm" role="status">{failed ? "Search is unavailable right now." : "Loading…"}</p>
      </PaletteShell>
    )
  }
  return <PaletteInner onClose={onClose} index={index} />
}

function PaletteShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Search books and writers" className="card relative mx-auto mt-16 w-[92%] max-w-xl overflow-hidden sm:mt-24">{children}</div>
    </div>
  )
}

function PaletteInner({ onClose, index }: { onClose: () => void; index: SearchIndex }) {
  const router = useRouter()
  const uid = useId()
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const term = q.trim().toLowerCase()
  const items = useMemo<Item[]>(() => {
    const authors: Item[] = term
      ? index.authors.filter((a) => [a.name, a.ar, a.ur].join(" ").toLowerCase().includes(term)).map((a) => ({
          key: `a-${a.id}`, href: `/authors/${a.id}`, kind: "author", title: a.name, color: authorColor(a.id),
        }))
      : []
    const books: Item[] = index.books.filter(
      (b) => !term || [b.title, b.ar, b.ur, b.authorName].join(" ").toLowerCase().includes(term),
    )
      .slice(0, 8)
      .map((b) => ({ key: `b-${b.id}`, href: `/books/${b.id}`, kind: "book", title: b.title, sub: b.authorName, hue: b.hue }))
    // Always offer the full-text search for what was typed (last row)
    const content: Item[] = q.trim() ? [{ key: "content", href: `/search?q=${encodeURIComponent(q.trim())}`, kind: "content", title: `Search inside books for “${q.trim()}”`, sub: "Full-text search" }] : []
    return [...authors, ...books, ...content]
  }, [term, index, q])

  const idx = Math.min(active, Math.max(items.length - 1, 0))

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    inputRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      prev?.focus?.()
    }
  }, [])

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" })
  }, [idx])

  const go = (it?: Item) => {
    if (!it) return
    onClose()
    router.push(it.href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose() }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive(items.length ? (idx + 1) % items.length : 0) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(items.length ? (idx - 1 + items.length) % items.length : 0) }
    else if (e.key === "Home" && items.length) { e.preventDefault(); setActive(0) }
    else if (e.key === "End" && items.length) { e.preventDefault(); setActive(items.length - 1) }
    else if (e.key === "Enter") { e.preventDefault(); go(items[idx]) }
    else if (e.key === "Tab") {
      const f = dialogRef.current?.querySelectorAll<HTMLElement>("input, button")
      if (!f?.length) return
      const first = f[0]!, last = f[f.length - 1]!
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  const label = "c-muted px-3 pt-2 pb-1 text-xs tracking-wider uppercase"
  const renderRow = (it: Item, i: number) => (
    <div
      key={it.key}
      id={`${uid}-${i}`}
      data-idx={i}
      role="option"
      aria-selected={i === idx}
      onMouseMove={() => i !== idx && setActive(i)}
      onClick={() => go(it)}
      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5"
      style={i === idx ? { background: "var(--lib-accent-soft)" } : undefined}
    >
      {it.kind === "content" ? (
        <span className="grid h-9 w-9 place-items-center rounded-full" style={{ background: "var(--lib-accent-soft)" }}>
          <svg aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 5h16M4 12h10M4 19h16" /></svg>
        </span>
      ) : it.kind === "author" ? (
        <span className="grid h-9 w-9 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: it.color }}>{initials(it.title)}</span>
      ) : (
        <span className="h-11 w-8 shrink-0 rounded-sm" style={{ background: `linear-gradient(145deg,${it.hue![0]},${it.hue![1]})` }} />
      )}
      <span>
        <span className="block text-sm font-medium">{it.title}</span>
        {it.sub && <span className="c-muted block text-xs">{it.sub}</span>}
      </span>
    </div>
  )
  const nAuthors = items.filter((i) => i.kind === "author").length
  const nBooks = items.filter((i) => i.kind === "book").length

  return (
    <div className="fixed inset-0 z-50" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Search books and writers" className="card relative mx-auto mt-16 w-[92%] max-w-xl overflow-hidden sm:mt-24">
        <div className="bd-line flex h-14 items-center gap-3 border-b px-5">
          <svg aria-hidden="true" width="18" height="18" fill="none" stroke="var(--lib-muted)" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0) }}
            role="combobox"
            aria-expanded="true"
            aria-controls={`${uid}-list`}
            aria-activedescendant={items.length ? `${uid}-${idx}` : undefined}
            aria-autocomplete="list"
            aria-label="Search by book or writer name"
            className="flex-1 bg-transparent text-base outline-none"
            placeholder="Search by book or writer name"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" onClick={onClose} className="c-muted text-sm" aria-label="Close search">Esc</button>
        </div>
        <div ref={listRef} id={`${uid}-list`} role="listbox" aria-label="Results" className="max-h-[60vh] overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="c-muted px-3 py-6 text-center text-sm" role="status">Nothing found. Try a shorter word.</p>
          ) : (
            <>
              {nAuthors > 0 && <p className={label} aria-hidden="true">Writers</p>}
              {items.slice(0, nAuthors).map((it, i) => renderRow(it, i))}
              {(nBooks > 0 || !term) && <p className={label} aria-hidden="true">{term ? "Books" : "Popular books"}</p>}
              {items.slice(nAuthors, nAuthors + nBooks).map((it, i) => renderRow(it, i + nAuthors))}
              {items.slice(nAuthors + nBooks).map((it, i) => renderRow(it, i + nAuthors + nBooks))}
            </>
          )}
        </div>
        <div className="bd-line flex items-center justify-between gap-4 border-t px-5 py-2 text-xs">
          <span className="c-muted hidden items-center gap-4 sm:flex" aria-hidden="true">
            <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
          </span>
          <button
            type="button"
            onClick={() => go({ key: "content-btn", href: q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search", kind: "content", title: "" })}
            className="ml-auto inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium"
            style={{ background: "var(--lib-accent-soft)" }}
          >
            <svg aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 5h16M4 12h10M4 19h16" /></svg>
            Search in content
          </button>
        </div>
      </div>
    </div>
  )
}
