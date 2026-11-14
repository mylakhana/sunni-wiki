const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

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
    notify()
  },
  /** Raw string for useSyncExternalStore (stable snapshot). */
  raw(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  subscribe(cb: () => void) {
    listeners.add(cb)
    window.addEventListener("storage", cb)
    return () => {
      listeners.delete(cb)
      window.removeEventListener("storage", cb)
    }
  },
}

/** Last chapter read: all slugs. `title` is a display hint only. */
export type LastRead = { book: string; vol: string | null; ch: string; title: string | null }
const LAST_KEY = "last:v2" // v1 stored mock ids/numbers; ignored on purpose
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 300

/** Parse a stored value defensively; anything malformed (or from an older format) yields null. */
export function parseLastRead(raw: string | null): LastRead | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Record<string, unknown> | null
    if (!v || typeof v !== "object" || !str(v.book) || !str(v.ch)) return null
    return { book: v.book, ch: v.ch, vol: str(v.vol) ? v.vol : null, title: str(v.title) ? v.title : null }
  } catch {
    return null
  }
}

export const chapterHref = (l: Pick<LastRead, "book" | "ch">) => `/books/${encodeURIComponent(l.book)}/${encodeURIComponent(l.ch)}`

export function saveLastRead(v: LastRead) {
  store.set(LAST_KEY, v)
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
