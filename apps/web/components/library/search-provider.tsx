"use client"

import { usePathname } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { CommandPalette } from "./command-palette"

const SearchContext = createContext<{ open: () => void }>({ open: () => {} })
export const useSearch = () => useContext(SearchContext)

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])
  const onSearchPage = usePathname() === "/search"

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((v) => !v)
        return
      }
      // "/" opens the palette; on the /search page it focuses that page's own search box instead.
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      const t = e.target as HTMLElement | null
      if (t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? "")) return
      e.preventDefault()
      const box = onSearchPage ? document.querySelector<HTMLInputElement>('form[role="search"] input[name="q"]') : null
      if (box) { box.focus(); box.select() } else setOpen(true)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onSearchPage])

  const value = useMemo(() => ({ open }), [open])
  return (
    <SearchContext.Provider value={value}>
      {children}
      {isOpen && <CommandPalette onClose={close} />}
    </SearchContext.Provider>
  )
}
