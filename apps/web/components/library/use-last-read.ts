"use client"

import { useSyncExternalStore } from "react"
import { lastReadStore, parseLastRead, type LastRead } from "@/lib/store"

/** The last chapter read, or null (nothing saved / malformed / server render). */
export function useLastRead(): LastRead | null {
  const raw = useSyncExternalStore(lastReadStore.subscribe, lastReadStore.getSnapshot, lastReadStore.getServerSnapshot)
  return parseLastRead(raw)
}
