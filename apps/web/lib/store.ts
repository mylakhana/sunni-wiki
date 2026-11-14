/** Tiny localStorage helpers that never throw (private mode, SSR, blocked storage). */
export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key)
      return v === null ? fallback : (JSON.parse(v) as T)
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  },
}

export type LastRead = { book: string; vol: number; ch: string; n: number }
const LAST_KEY = "last"
const listeners = new Set<() => void>()

export function saveLastRead(v: LastRead) {
  store.set(LAST_KEY, v)
  listeners.forEach((l) => l())
}
/** Raw JSON string so useSyncExternalStore gets a stable snapshot. */
export const lastReadStore = {
  subscribe(cb: () => void) {
    listeners.add(cb)
    window.addEventListener("storage", cb)
    return () => {
      listeners.delete(cb)
      window.removeEventListener("storage", cb)
    }
  },
  getSnapshot(): string | null {
    try {
      return localStorage.getItem(LAST_KEY)
    } catch {
      return null
    }
  },
  getServerSnapshot: (): string | null => null,
}
