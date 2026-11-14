import Link from "next/link"
import { Suspense } from "react"
import { AuthorAvatar } from "@/components/library/author-avatar"
import { BookGrid } from "@/components/library/book-card"
import { ContinueReading } from "@/components/library/continue-reading"
import { EmptyState, libraryDown } from "@/components/library/empty-state"
import { HeroSearch } from "@/components/library/hero-search"
import { SiteFooter } from "@/components/library/site-footer"
import { loadLibrary } from "@/lib/api/library"

const h2 = "text-2xl font-semibold tracking-tight sm:text-3xl"

async function HomeLibrary() {
  const { books, authors, categories, error } = await loadLibrary()
  if (error) return <EmptyState {...libraryDown} />
  if (!books.length) return <EmptyState title="No books yet" text="Books will appear here as soon as they are published." />

  const featured = [...books].sort((a, b) => b.volumes - a.volumes || a.title.localeCompare(b.title)).slice(0, 4)
  const recent = [...books].sort((a, b) => b.added.localeCompare(a.added)).slice(0, 4)

  return (
    <>
      <ContinueReading books={books} />

      {categories.length > 0 && (
        <section className="mb-14">
          <div className="hide-scroll flex gap-2 overflow-x-auto pb-1 sm:justify-center">
            {categories.map((c) => (
              <Link key={c.id} href={`/browse?category=${c.id}`} className="card flex h-10 shrink-0 items-center rounded-full px-5 text-sm font-medium">{c.en}</Link>
            ))}
          </div>
        </section>
      )}

      {books.length > recent.length && (
        <section className="mb-16">
          <div className="mb-6 flex items-end justify-between">
            <h2 className={h2}>Featured books</h2>
            <Link href="/browse" className="c-accent text-sm font-medium">See all ›</Link>
          </div>
          <BookGrid books={featured} />
        </section>
      )}

      {authors.length > 0 && (
        <section className="mb-16">
          <div className="mb-6 flex items-end justify-between">
            <h2 className={h2}>Browse by writer</h2>
            <Link href="/authors" className="c-accent text-sm font-medium">All writers ›</Link>
          </div>
          <div className="hide-scroll flex gap-6 overflow-x-auto pb-2">
            {authors.map((a) => (
              <Link key={a.id} href={`/authors/${a.id}`} className="group w-28 shrink-0 text-center">
                <div className="mx-auto h-20 w-20 transition group-hover:scale-105"><AuthorAvatar author={a} size={80} /></div>
                <p className="mt-3 text-sm leading-tight font-medium">{a.name}</p>
                <p className="c-muted mt-0.5 text-xs">{a.bookCount} {a.bookCount === 1 ? "book" : "books"}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-16">
        <h2 className={`${h2} mb-6`}>Recently added</h2>
        <BookGrid books={recent} />
      </section>

      {categories.length > 0 && (
        <section>
          <h2 className={`${h2} mb-6`}>Explore by topic</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <Link key={c.id} href={`/browse?category=${c.id}`} className="card flex items-center justify-between p-6 transition hover:-translate-y-0.5">
                <div>
                  <h3 className="text-lg font-semibold">{c.en}</h3>
                  {c.desc && <p className="c-muted mt-1 text-sm">{c.desc}</p>}
                  <p className="c-accent mt-3 text-xs">{c.bookCount} {c.bookCount === 1 ? "book" : "books"}</p>
                </div>
                {c.ar && <span className="font-ar c-gold text-4xl">{c.ar}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function HomeSkeleton() {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading library">
      <div className="mb-14 flex justify-center gap-2">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="card h-10 w-24 rounded-full" />)}
      </div>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="card aspect-[2/3] rounded-2xl" />)}
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <>
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="pt-10 pb-10 text-center sm:pt-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon.png" alt="SunniWiki" width={96} height={99} className="mx-auto mb-4 h-24 w-auto" />
          <p className="font-ar c-gold text-2xl sm:text-3xl">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</p>
          <h1 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
            Read trusted Islamic books.<br className="hidden sm:block" /> <span className="c-muted">Free, in one place.</span>
          </h1>
          <p className="c-muted mx-auto mt-5 max-w-xl text-lg">Open a book, pick a volume, and start reading in Arabic, Urdu or English.</p>
          <HeroSearch />
        </section>

        <Suspense fallback={<HomeSkeleton />}>
          <HomeLibrary />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  )
}
