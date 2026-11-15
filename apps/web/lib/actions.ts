"use server"

import { ApiError } from "@/lib/api/client"
import { getChapters, getContextUnits, getSearchIndex } from "@/lib/api/library"
import type { ChapterItem, ContextUnits, SearchIndex } from "@/lib/types"

const ok = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max

/** Lazily load one level of a book's table of contents (called from the client contents tree). */
export async function loadChapterLevel(
  book: string,
  volume: string | null,
  parentId: string | null,
): Promise<{ items: ChapterItem[] } | { error: true }> {
  if (!ok(book) || (volume !== null && !ok(volume)) || (parentId !== null && !ok(parentId))) return { error: true }
  try {
    return { items: await getChapters(book, volume, parentId) }
  } catch (e) {
    console.error("[web] chapter list failed:", e instanceof Error ? e.message : e)
    return { error: true }
  }
}

/** Slim book/writer index for the command palette (from the cached library). Called when the palette opens. */
export async function loadSearchIndex(): Promise<SearchIndex> {
  return getSearchIndex()
}

export type ContextUnitsResult = { units: ContextUnits } | { tooLarge: true; message: string } | { notFound: true } | { error: true }

/** Ask AI: the selectable units under a volume (`volume:<slug>`) or a node (`chapter:<id>`), in reading order. */
export async function loadContextUnits(book: string, node: string): Promise<ContextUnitsResult> {
  if (!ok(book) || !/^(volume:[\w.-]{1,100}|chapter:\d{1,12})$/.test(node)) return { error: true }
  try {
    return { units: await getContextUnits(book, node) }
  } catch (e) {
    if (e instanceof ApiError && e.status === 413) return { tooLarge: true, message: e.detail ?? "Selection is too large for the AI." }
    if (e instanceof ApiError && e.notFound) return { notFound: true }
    console.error("[web] context units failed:", e instanceof Error ? e.message : e)
    return { error: true }
  }
}
