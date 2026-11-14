"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import type { Author, Book, Category } from "@/lib/types"
import { langName } from "@/lib/ui"
import { BookGrid } from "./book-card"

const select = "card h-11 rounded-xl px-4 text-sm outline-none"
const SORTS = [
  { id: "new", label: "Newest first" },
  { id: "old", label: "Oldest first" },
  { id: "az", label: "A to Z" },
  { id: "za", label: "Z to A" },
  { id: "vols", label: "Most volumes" },
]

export function BrowseSkeleton() {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading books">
      <div className="mt-8 flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="card h-10 w-24 shrink-0 rounded-full" />)}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="card h-11 rounded-xl" />)}
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="card h-64 rounded-2xl" />)}
      </div>
    </div>
  )
}

export function BrowseView({ books, authors, categories }: { books: Book[]; authors: Author[]; categories: Category[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const cat = params.get("category") ?? ""
  const author = params.get("author") ?? ""
  const lang = params.get("lang") ?? ""
  const sort = params.get("sort") ?? "new"
  const urlQ = params.get("q") ?? ""
  const [draft, setDraft] = useState<{ from: string; v: string }>({ from: urlQ, v: urlQ })
  // Re-sync the input when the URL changes (back/forward)
  const q = draft.from === urlQ ? draft.v : urlQ

  function update(patch: Record<string, string>, replace = false) {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v && !(k === "sort" && v === "new")) next.set(k, v)
      else next.delete(k)
    }
    const qs = next.toString()
    const url = qs ? `${pathname}?${qs}` : pathname
    if (replace) router.replace(url, { scroll: false })
    else router.push(url, { scroll: false })
  }

  const langs = useMemo(() => [...new Set(books.flatMap((b) => b.langs))].sort(), [books])

  const list = useMemo(() => {
    const needle = urlQ.trim().toLowerCase()
    const out = books.filter(
      (b) =>
        (!cat || b.cat === cat) &&
        (!author || b.author === author) &&
        (!lang || b.langs.includes(lang)) &&
        (!needle || [b.title, b.ar, b.ur, b.blurb, b.authorName].some((s) => s?.toLowerCase().includes(needle))),
    )
    return out.sort((a, b) => {
      switch (sort) {
        case "az": return a.title.localeCompare(b.title)
        case "za": return b.title.localeCompare(a.title)
        case "old": return a.added.localeCompare(b.added)
        case "vols": return b.volumes - a.volumes
        default: return b.added.localeCompare(a.added)
      }
    })
  }, [books, cat, author, lang, sort, urlQ])

  const active = [
    cat && { k: "category", label: categories.find((c) => c.id === cat)?.en ?? cat },
    author && { k: "author", label: authors.find((a) => a.id === author)?.name ?? author },
    lang && { k: "lang", label: langName(lang) },
    urlQ && { k: "q", label: `"${urlQ}"` },
  ].filter((x): x is { k: string; label: string } => !!x)

  return (
    <>
      <div className="hide-scroll mt-8 flex gap-2 overflow-x-auto pb-1">
        {[{ id: "", en: "All" }, ...categories].map((c) => (
          <button
            key={c.id}
            onClick={() => update({ category: c.id })}
            aria-pressed={cat === c.id}
            className={`h-10 shrink-0 rounded-full px-5 text-sm font-medium ${cat === c.id ? "bg-lib-accent text-white" : "card"}`}
          >
            {c.en}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setDraft({ from: urlQ, v: e.target.value })
            update({ q: e.target.value.trim() }, true)
          }}
          placeholder="Filter by title"
          className={select}
          aria-label="Filter by title"
        />
        <select value={author} onChange={(e) => update({ author: e.target.value })} className={select} aria-label="Writer">
          <option value="">All writers</option>
          {authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={lang} onChange={(e) => update({ lang: e.target.value })} className={select} aria-label="Language">
          <option value="">Any language</option>
          {langs.map((l) => <option key={l} value={l}>{langName(l)}</option>)}
        </select>
        <select value={sort} onChange={(e) => update({ sort: e.target.value })} className={select} aria-label="Sort">
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {active.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {active.map((f) => (
            <button key={f.k} onClick={() => update({ [f.k]: "" })} className="card flex h-8 items-center gap-2 rounded-full px-3 text-xs" aria-label={`Remove filter ${f.label}`}>
              {f.label} <span aria-hidden>×</span>
            </button>
          ))}
          <button onClick={() => update({ category: "", author: "", lang: "", q: "" })} className="c-accent text-xs font-medium">Clear all</button>
        </div>
      )}

      <p className="c-muted mt-8 mb-6 text-sm" aria-live="polite">{list.length} {list.length === 1 ? "book" : "books"}</p>
      <BookGrid books={list} />
      {list.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-lg font-medium">No books match your choices</p>
          <p className="c-muted mx-auto mt-2 max-w-sm text-sm">
            {active.length > 1 ? "Try removing one of the filters above, or start again." : "Try a different word or choose another topic."}
          </p>
          <button
            onClick={() => update({ category: "", author: "", lang: "", q: "" })}
            className="bg-lib-accent mt-5 h-10 rounded-full px-5 text-sm text-white"
          >
            Show all books
          </button>
        </div>
      )}
    </>
  )
}
