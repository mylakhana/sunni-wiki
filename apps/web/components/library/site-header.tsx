"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSearch } from "./search-provider"
import { ThemeToggle } from "./theme-toggle"

const NAV = [
  { href: "/", label: "Library" },
  { href: "/browse", label: "Browse" },
  { href: "/authors", label: "Writers" },
  { href: "/search", label: "Search in books" },
]

export function SiteHeader() {
  const pathname = usePathname()
  const onReader = /^\/books\/[^/]+/.test(pathname)
  const { open } = useSearch()
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))
  const links = NAV.map((n) => (
    <Link
      key={n.href}
      href={n.href}
      className={`rounded-full px-3 py-1.5 text-sm ${isActive(n.href) ? "c-accent font-semibold" : "c-muted"}`}
      style={isActive(n.href) ? { background: "var(--lib-accent-soft)" } : undefined}
    >
      {n.label}
    </Link>
  ))

  return (
    <>
      <div className="site-hdr bd-line fixed inset-x-0 top-0 z-40 border-b" style={onReader ? undefined : { background: "color-mix(in srgb, var(--lib-bg) 40%, transparent)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)" }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.png" alt="" width={28} height={29} className="h-8 w-auto" />
            <span>SunniWiki</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-1 sm:flex">{links}</nav>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={open}
              className="c-muted flex h-9 items-center gap-2 rounded-full px-3 text-sm"
              style={{ background: "var(--lib-surface)" }}
              aria-label="Search books and writers"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <span className="hidden sm:inline">Search books</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
        {!onReader && <nav className="hide-scroll flex gap-1 overflow-x-auto px-3 pb-2 sm:hidden">{links}</nav>}
      </div>
      {/* spacer for the fixed header (56px, plus 40px mobile nav row) */}
      <div className="h-14 sm:h-14" />
      {!onReader && <div className="h-10 sm:hidden" />}
    </>
  )
}
