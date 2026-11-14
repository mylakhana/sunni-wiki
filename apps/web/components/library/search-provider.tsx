"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { CommandPalette } from "./command-palette"

const SearchContext = createContext<{ open: () => void }>({ open: () => {} })
export const useSearch = () => useContext(SearchContext)

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const value = useMemo(() => ({ open }), [open])
  return (
    <SearchContext.Provider value={value}>
      {children}
      {isOpen && <CommandPalette onClose={close} />}
    </SearchContext.Provider>
  )
}
