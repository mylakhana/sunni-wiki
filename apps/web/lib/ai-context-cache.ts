/**
 * Browser cache for the Markdown of Ask-AI context units (IndexedDB, with an in-memory fallback).
 *
 * Entries are keyed `${unitId}:${updatedAt}` (a changed chapter is a new key). Because `updatedAt` is only known after
 * fetching, a `latest` store maps each unit id to its newest key (+ etag); callers revalidate with If-None-Match.
 * If IndexedDB is unavailable or throws (private mode, blocked, quota) everything silently uses the memory Map.
 */
import type { Titles } from "@/lib/types"

export type CachedUnit = {
  id: string
  slug: string
  book: string
  title: Titles
  /** Titles of the ancestors (outermost first), already resolved to one language each. */
  path: string[]
  markdown: string
  chars: number
  updatedAt: string
  etag: string | null
  storedAt: number
}

type Latest = { id: string; key: string; storedAt: number }

const DB_NAME = "sunniwiki-ai-context"
const DB_VERSION = 1
const MAX_AGE_MS = 30 * 24 * 3600 * 1000
const MAX_CHARS = 60_000_000 // ~ 120 MB of UTF-16 at most; oldest evicted first

const mem = new Map<string, CachedUnit>() // latest entry per unit id
export const entryKey = (u: Pick<CachedUnit, "id" | "updatedAt">) => `${u.id}:${u.updatedAt}`

let dbPromise: Promise<IDBDatabase | null> | null = null
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null)
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains("entries")) db.createObjectStore("entries", { keyPath: "key" })
        if (!db.objectStoreNames.contains("latest")) db.createObjectStore("latest", { keyPath: "id" })
      }
      req.onsuccess = () => {
        req.result.onclose = () => { dbPromise = Promise.resolve(null) }
        resolve(req.result)
      }
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

const wrap = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error) })

/** Newest cached entry for each id (missing ids are absent from the result). */
export async function getMany(ids: string[]): Promise<Map<string, CachedUnit>> {
  const out = new Map<string, CachedUnit>()
  const db = await openDb()
  if (db) {
    try {
      const tx = db.transaction(["latest", "entries"], "readonly")
      const latest = tx.objectStore("latest")
      const entries = tx.objectStore("entries")
      await Promise.all(ids.map(async (id) => {
        const l = (await wrap(latest.get(id))) as Latest | undefined
        const e = l ? ((await wrap(entries.get(l.key))) as CachedUnit | undefined) : undefined
        if (e) out.set(id, e)
      }))
    } catch {}
  }
  for (const id of ids) if (!out.has(id)) { const m = mem.get(id); if (m) out.set(id, m) }
  return out
}

/** Stores the units as the newest version of each id and drops the superseded versions. */
export async function putMany(units: CachedUnit[]): Promise<void> {
  for (const u of units) mem.set(u.id, u)
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction(["latest", "entries"], "readwrite")
    const latest = tx.objectStore("latest")
    const entries = tx.objectStore("entries")
    for (const u of units) {
      const key = entryKey(u)
      const old = (await wrap(latest.get(u.id))) as Latest | undefined
      if (old && old.key !== key) entries.delete(old.key)
      entries.put({ ...u, key })
      latest.put({ id: u.id, key, storedAt: u.storedAt } satisfies Latest)
    }
    await done(tx)
  } catch {}
}

/** Drops entries older than 30 days and, if the cache is huge, the oldest ones (never the ids in `keep`). */
export async function prune(keep: string[] = []): Promise<void> {
  const now = Date.now()
  for (const [id, u] of mem) if (now - u.storedAt > MAX_AGE_MS && !keep.includes(id)) mem.delete(id)
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction(["latest", "entries"], "readwrite")
    const latest = tx.objectStore("latest")
    const entries = tx.objectStore("entries")
    const all = (await wrap(latest.getAll())) as Latest[]
    const sized = await Promise.all(all.map(async (l) => ({ l, chars: ((await wrap(entries.get(l.key))) as CachedUnit | undefined)?.chars ?? 0 })))
    let total = sized.reduce((s, x) => s + x.chars, 0)
    for (const { l, chars } of sized.sort((a, b) => a.l.storedAt - b.l.storedAt)) {
      if (keep.includes(l.id)) continue
      if (now - l.storedAt > MAX_AGE_MS || total > MAX_CHARS) {
        total -= chars
        entries.delete(l.key)
        latest.delete(l.id)
        mem.delete(l.id)
      }
    }
    await done(tx)
  } catch {}
}
