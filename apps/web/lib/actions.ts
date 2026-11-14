"use server"

import { getChapters, getSearchIndex } from "@/lib/api/library"
import type { ChapterItem, SearchIndex } from "@/lib/types"

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
