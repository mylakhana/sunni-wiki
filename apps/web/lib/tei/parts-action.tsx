"use server"

import type { ReactNode } from "react"
import { getChapter } from "@/lib/api/library"
import { renderTeiPart } from "./render"

const ok = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max

/** Next part of a long chapter, rendered on the server (called by <LazyParts> when the reader nears the end). */
export async function loadChapterPart(
  book: string,
  chapter: string,
  part: number,
): Promise<{ node: ReactNode; hasMore: boolean } | { error: true }> {
  if (!ok(book) || !ok(chapter) || !Number.isInteger(part) || part < 2 || part > 10_000) return { error: true }
  try {
    const c = await getChapter(book, chapter)
    if (!c?.tei) return { error: true }
    const { node, parts } = renderTeiPart(c.tei, part)
    return { node, hasMore: part < parts }
  } catch (e) {
    console.error("[web] chapter part failed:", e instanceof Error ? e.message : e)
    return { error: true }
  }
}
