import type { Metadata } from "next"
import Link from "next/link"
import { AuthorAvatar } from "@/components/library/author-avatar"
import { SiteFooter } from "@/components/library/site-footer"
import { AUTHORS, booksByAuthor } from "@/lib/data"

const description = "Scholars whose books you can read here."
export const metadata: Metadata = { title: "Writers", description, openGraph: { title: "Writers", description } }

export default function AuthorsPage() {
  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        <h1 className="text-4xl font-semibold tracking-tight">Writers</h1>
        <p className="c-muted mt-2">Scholars whose books you can read here.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AUTHORS.map((w) => (
            <Link key={w.id} href={`/authors/${w.id}`} className="card flex items-center gap-4 p-5 transition hover:-translate-y-0.5">
              <AuthorAvatar author={w} size={64} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{w.name}</span>
                <span className="font-ar c-muted block text-lg" dir="rtl">{w.ar}</span>
                <span className="c-accent mt-1 block text-xs">{booksByAuthor(w.id).length} book(s)</span>
              </span>
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
