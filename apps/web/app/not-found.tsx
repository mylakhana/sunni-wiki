import Link from "next/link"

export default function NotFound() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
      <h1 className="text-4xl font-semibold tracking-tight">Page not found</h1>
      <p className="c-muted mt-3">We couldn’t find what you were looking for.</p>
      <Link href="/" className="bg-lib-accent mt-8 inline-block h-11 rounded-full px-6 leading-[2.75rem] text-sm text-white">Back to library</Link>
    </main>
  )
}
