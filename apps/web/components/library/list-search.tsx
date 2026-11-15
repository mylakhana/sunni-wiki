"use client"

import Link from "next/link"
import { useState } from "react"
import type { Author, Book } from "@/lib/types"
import { AuthorAvatar } from "./author-avatar"
import { BookGrid } from "./book-card"
import { EmptyState } from "./empty-state"

const field = "card h-11 w-full min-w-0 rounded-xl px-4 text-sm outline-none sm:max-w-sm"
const has = (needle: string, ...vals: (string | null | undefined)[]) => !needle || vals.some((s) => s?.toLowerCase().includes(needle))

function SearchField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} aria-label={label} className={field} />
}

export function AuthorSearchList({ authors }: { authors: Author[] }) {
  const [q, setQ] = useState("")
  const needle = q.trim().toLowerCase()
  const list = authors.filter((w) => has(needle, w.name, w.ar, w.ur))
  return (
    <>
      <div className="mt-8"><SearchField value={q} onChange={setQ} label="Search writers" /></div>
      {list.length === 0 ? <EmptyState title="No writers match your search" /> : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((w) => (
            <Link key={w.id} href={`/authors/${w.id}`} className="card flex items-center gap-4 p-5 transition hover:-translate-y-0.5">
              <AuthorAvatar author={w} size={64} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{w.name}</span>
                {w.ar && <span className="font-ar c-muted block text-lg" dir="rtl">{w.ar}</span>}
                <span className="c-accent mt-1 block text-xs">{w.bookCount} {w.bookCount === 1 ? "book" : "books"}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

export function AuthorBookSearch({ books }: { books: Book[] }) {
  const [q, setQ] = useState("")
  const needle = q.trim().toLowerCase()
  const list = books.filter((b) => has(needle, b.title, b.ar, b.ur, b.blurb))
  return (
    <>
      <div className="mb-6"><SearchField value={q} onChange={setQ} label="Search books" /></div>
      {list.length ? <BookGrid books={list} /> : <EmptyState title="No books match your search" />}
    </>
  )
}
