import Link from "next/link"
import { searchContent } from "@/lib/api/search"
import type { SearchFacetDto, SearchGroupDto, SearchSnippetDto } from "@/lib/api/types"
import { SEARCH_PAGE_SIZE, searchHref, withState, type SearchState } from "@/lib/search-params"
import { titleOf } from "@/lib/types"
import { EmptyState } from "./empty-state"
import { SearchSnippet } from "./search-snippet"

/** Display names for facet ids, built from the cached library (numeric API id -> name). */
export type FacetNames = { books: Map<number, string>; authors: Map<number, string>; categories: Map<number, string> }

export function SearchResultsSkeleton() {
  return (
    <div className="mt-8 animate-pulse space-y-4" role="status" aria-label="Searching">
      {Array.from({ length: 3 }, (_, i) => <div key={i} className="card h-40 rounded-2xl" />)}
    </div>
  )
}

export const searchIntro = {
  title: "Search the text of every book",
  text: "Type words, then choose All words, Any word or Exact phrase. Narrow it down by book, writer, topic or language.",
}

/** Opens the chapter with the whole hit paragraph highlighted (reader re-finds ?q and highlights the whole block, ?b=1). */
function snippetHref(chapterHref: string, s: SearchSnippetDto) {
  if (s.quote?.q) return `${chapterHref}?q=${encodeURIComponent(s.quote.q)}&b=1`
  return s.anchorId ? `${chapterHref}#${encodeURIComponent(s.anchorId)}` : chapterHref
}

function Facet({ title, rows, names, active, hrefFor }: { title: string; rows: SearchFacetDto[]; names: Map<number, string>; active: (id: number) => boolean; hrefFor: (id: number, on: boolean) => string }) {
  const shown = rows.filter((r) => names.has(r.id)).slice(0, 8)
  if (!shown.length) return null
  return (
    <section>
      <h3 className="c-muted mb-2 text-xs tracking-wider uppercase">{title}</h3>
      <ul className="space-y-1">
        {shown.map((r) => {
          const on = active(r.id)
          return (
            <li key={r.id}>
              <Link
                href={hrefFor(r.id, on)}
                aria-current={on ? "true" : undefined}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm"
                style={on ? { background: "var(--lib-accent-soft)" } : undefined}
              >
                <span className={`min-w-0 truncate ${on ? "c-accent font-semibold" : ""}`}>{names.get(r.id)}</span>
                <span className="c-muted shrink-0 text-xs">{r.count}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Group({ g }: { g: SearchGroupDto }) {
  const bookTitle = titleOf({ en: g.book.titleEn, ar: g.book.titleAr, ur: g.book.titleUr })
  const bookHref = `/books/${encodeURIComponent(g.book.slug)}`
  return (
    <article className="card p-5 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold"><Link href={bookHref} className="hover:underline">{bookTitle}</Link></h2>
        <p className="c-muted text-xs">{g.chapterCount} {g.chapterCount === 1 ? "chapter" : "chapters"} match</p>
      </header>
      <ul className="mt-4 divide-y bd-line">
        {g.chapters.map((c) => {
          const href = `${bookHref}/${encodeURIComponent(c.slug)}`
          return (
            <li key={c.chapterId} className="py-4 first:pt-0 last:pb-0">
              <Link href={href} className="c-accent text-sm font-medium hover:underline">{titleOf({ en: c.titleEn, ar: c.titleAr, ur: c.titleUr })}</Link>
              {c.hitCount > 1 && <span className="c-muted ml-2 text-xs">{c.hitCount} matching passages</span>}
              <ul className="mt-2 space-y-2">
                {c.snippets.map((s, i) => (
                  <li key={`${s.anchorId ?? "top"}-${i}`}>
                    <Link href={snippetHref(href, s)} className="block rounded-xl px-3 py-2 hover:bg-(--lib-accent-soft)">
                      <SearchSnippet html={s.html} lang={s.lang} />
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </article>
  )
}

function Pager({ state, pages }: { state: SearchState; pages: number }) {
  if (pages <= 1) return null
  const link = "card inline-flex h-10 items-center rounded-full px-5 text-sm"
  return (
    <nav className="mt-8 flex items-center justify-between gap-3" aria-label="Pagination">
      {state.page > 1 ? <Link href={searchHref({ ...state, page: state.page - 1 })} className={link} rel="prev">Previous</Link> : <span />}
      <span className="c-muted text-sm">Page {state.page} of {pages}</span>
      {state.page < pages ? <Link href={searchHref({ ...state, page: state.page + 1 })} className={link} rel="next">Next</Link> : <span />}
    </nav>
  )
}

/** Runs the search (server side) and renders the grouped results, facets and pagination. */
export async function SearchResults({ state, names }: { state: SearchState; names: FacetNames }) {
  if (!state.q) return <EmptyState {...searchIntro} />
  const out = await searchContent(state)
  if (out.status === "unavailable") return <EmptyState title="Content search is unavailable right now" text="The rest of the library still works. Please try again in a moment." />
  if (out.status === "invalid") return <EmptyState title="This search can't be run" text={out.message} />
  const { data } = out
  if (data.total === 0 || data.groups.length === 0) {
    return (
      <EmptyState
        title={`No results for “${state.q}”`}
        text={state.mode === "phrase" ? "Try All words instead of Exact phrase, or remove a filter." : "Try fewer or different words, Any word, or remove a filter."}
      />
    )
  }
  const pages = Math.max(1, Math.ceil(data.total / (data.pageSize || SEARCH_PAGE_SIZE)))
  const f = data.facets
  const toggle = (on: boolean, set: Partial<SearchState>, off: Partial<SearchState>) => searchHref(withState(state, on ? off : set))
  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_1fr]">
      <aside className="card h-fit space-y-5 p-5 lg:order-first" aria-label="Narrow results">
        <Facet title="Books" rows={f.books} names={names.books} active={(id) => state.books.includes(id)}
          hrefFor={(id, on) => toggle(on, { books: [id] }, { books: [] })} />
        <Facet title="Writers" rows={f.authors} names={names.authors} active={(id) => state.author === id}
          hrefFor={(id, on) => toggle(on, { author: id }, { author: null })} />
        <Facet title="Topics" rows={f.categories} names={names.categories} active={(id) => state.category === id}
          hrefFor={(id, on) => toggle(on, { category: id }, { category: null })} />
      </aside>
      <section aria-label="Results" className="min-w-0">
        <p className="c-muted mb-4 text-sm" aria-live="polite">{data.total} {data.total === 1 ? "chapter" : "chapters"} found</p>
        <div className="space-y-4">{data.groups.map((g) => <Group key={g.book.id} g={g} />)}</div>
        <Pager state={state} pages={pages} />
      </section>
    </div>
  )
}
