"use client"

import { useSearch } from "./search-provider"

export function HeroSearch() {
  const { open } = useSearch()
  return (
    <button
      onClick={open}
      className="card c-muted mx-auto mt-8 flex h-12 w-full max-w-md items-center gap-3 rounded-full px-5 text-left"
    >
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      Search for a book or writer
    </button>
  )
}
