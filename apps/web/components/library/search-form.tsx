"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { SEARCH_MAX_QUERY, searchHref, withState, type SearchLang, type SearchMode, type SearchSort, type SearchState } from "@/lib/search-params"
import { FilterCombobox, type FilterOption } from "./filter-combobox"

export type SearchScopeOptions = { books: FilterOption[]; authors: FilterOption[]; categories: FilterOption[] }

const MODES: { id: SearchMode; label: string; hint: string }[] = [
  { id: "all", label: "All words", hint: "Every word must appear in the same chapter" },
  { id: "any", label: "Any word", hint: "At least one of the words" },
  { id: "phrase", label: "Exact phrase", hint: "The words exactly in this order" },
]
const LANGS: { id: SearchLang; label: string }[] = [
  { id: "all", label: "All languages" },
  { id: "ur", label: "Urdu" },
  { id: "ar", label: "Arabic" },
  { id: "en", label: "English" },
]
const SORTS: FilterOption[] = [
  { value: "relevance", label: "Most relevant" },
  { value: "canonical", label: "Book order" },
  { value: "hits", label: "Most matching passages" },
]
const ALL_BOOKS = { value: "", label: "All books" }
const ALL_AUTHORS = { value: "", label: "All writers" }
const ALL_CATEGORIES = { value: "", label: "All topics" }

function Pills<T extends string>({ label, items, value, onChange }: { label: string; items: { id: T; label: string; hint?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          title={i.hint}
          onClick={() => onChange(i.id)}
          aria-pressed={value === i.id}
          className={`h-9 shrink-0 rounded-full px-4 text-sm font-medium ${value === i.id ? "bg-lib-accent text-(--lib-bg)" : "card"}`}
        >
          {i.label}
        </button>
      ))}
    </div>
  )
}

/** Query box, mode/language toggles and scope pickers. Every change is pushed to the URL (the page re-renders from it). */
export function SearchForm({ state, scope }: { state: SearchState; scope: SearchScopeOptions }) {
  const router = useRouter()
  // Draft of the text box; re-synced when the URL's query changes (back/forward, facet links).
  const [draft, setDraft] = useState({ from: state.q, v: state.q })
  const q = draft.from === state.q ? draft.v : state.q

  const go = (patch: Partial<SearchState>) => router.push(searchHref(withState({ ...state, q: q.trim() }, patch)))

  const oneBook = state.books.length === 1 ? String(state.books[0]) : ""
  type Chip = { k: string; label: string; clear: Partial<SearchState> }
  const chips: Chip[] = ([
    state.books.length > 1 && { k: "books", label: `${state.books.length} books`, clear: { books: [] } },
    state.volume && { k: "volume", label: "One volume", clear: { volume: null } },
    state.chapter && { k: "chapter", label: "One chapter", clear: { chapter: null } },
  ] as (Chip | false | null)[]).filter((x): x is Chip => !!x)

  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); go({}) }}
      className="mt-8"
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          name="q"
          value={q}
          onChange={(e) => setDraft({ from: state.q, v: e.target.value })}
          maxLength={SEARCH_MAX_QUERY}
          placeholder="Search inside every book…"
          aria-label="Search inside books"
          autoComplete="off"
          spellCheck={false}
          dir="auto"
          autoFocus={!state.q}
          className="card h-12 w-full min-w-0 flex-1 rounded-full px-5 text-base outline-none"
        />
        <button type="submit" className="bg-lib-accent h-12 shrink-0 rounded-full px-8 text-sm font-medium text-(--lib-bg)">Search</button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Pills label="Match" items={MODES} value={state.mode} onChange={(mode) => go({ mode })} />
        <Pills label="Language" items={LANGS} value={state.lang} onChange={(lang) => go({ lang })} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterCombobox label="Book" value={oneBook} onChange={(v) => go({ books: v ? [Number(v)] : [] })} options={[ALL_BOOKS, ...scope.books]} />
        <FilterCombobox label="Writer" value={state.author ? String(state.author) : ""} onChange={(v) => go({ author: v ? Number(v) : null })} options={[ALL_AUTHORS, ...scope.authors]} />
        <FilterCombobox label="Topic" value={state.category ? String(state.category) : ""} onChange={(v) => go({ category: v ? Number(v) : null })} options={[ALL_CATEGORIES, ...scope.categories]} />
        <FilterCombobox label="Sort" value={state.sort} onChange={(v) => go({ sort: v as SearchSort })} options={SORTS} />
      </div>

      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button key={c.k} type="button" onClick={() => go(c.clear)} className="card flex h-8 items-center gap-2 rounded-full px-3 text-xs" aria-label={`Remove filter ${c.label}`}>
              {c.label} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}
    </form>
  )
}
