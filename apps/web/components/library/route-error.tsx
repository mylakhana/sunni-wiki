"use client"

import Link from "next/link"

/** Shared body for route error.tsx files: friendly message, retry, and a way out. */
export function RouteError({ title, reset }: { title: string; reset: () => void }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="c-muted mt-3">Something went wrong while loading this page. Please try again.</p>
      <div className="mt-8 flex justify-center gap-3">
        <button onClick={reset} className="bg-lib-accent h-11 rounded-full px-6 text-sm text-(--lib-bg)">Try again</button>
        <Link href="/" className="card inline-flex h-11 items-center rounded-full px-6 text-sm">Back to library</Link>
      </div>
    </main>
  )
}
