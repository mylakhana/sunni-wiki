"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import { store } from "@/lib/store"

/** A localStorage-backed preference: `fallback` on the server and when nothing valid is saved. */
export function usePref<T>(key: string, fallback: T): [T, (v: T | ((o: T) => T)) => void] {
  const raw = useSyncExternalStore(store.subscribe, () => store.raw(key), () => null)
  const value = useMemo(() => {
    if (raw === null) return fallback
    try {
      const v = JSON.parse(raw) as unknown
      // merge object prefs over defaults so old/partial saves still work
      if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) return v && typeof v === "object" ? ({ ...fallback, ...v } as T) : fallback
      return typeof v === typeof fallback ? (v as T) : fallback
    } catch {
      return fallback
    }
  }, [raw, fallback])
  const set = useCallback((v: T | ((o: T) => T)) => store.set(key, typeof v === "function" ? (v as (o: T) => T)(value) : v), [key, value])
  return [value, set]
}
