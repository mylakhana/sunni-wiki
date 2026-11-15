"use server"

import type { ReactNode } from "react"
import { ChapterArticle } from "@/components/library/chapter-article"
import { getChapter } from "@/lib/api/library"
import { isLongTei, TeiContent } from "./render"

const ok = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max

/**
 * The chapter that follows `from` in reading order, rendered on the server (called by <ChapterStream> when the reader
 * reaches the end of the last chapter on screen). Groups / chapters without text are skipped; anything in `seen` is
 * never returned twice. `next` = where the stream continues afterwards (null at the end of the book).
 */
export async function loadNextChapter(
  book: string, bookTitle: string, authorName: string, from: string, seen: string[],
): Promise<{ node: ReactNode; slug: string; next: string | null } | { done: true } | { error: true }> {
  if (!ok(book) || !ok(bookTitle, 300) || !ok(authorName, 300) || !ok(from) || !Array.isArray(seen) || seen.length > 500 || !seen.every((s) => ok(s))) return { error: true }
  try {
    let slug: string | null = from
    for (let hop = 0; hop < 8 && slug; hop++) {
      const c = await getChapter(book, slug)
      if (!c) break
      if (seen.includes(c.slug) || seen.includes(slug)) { slug = c.next?.slug ?? null; continue }
      if (c.redirect) { slug = c.redirect.slug; continue }
      if (c.level === 0 || !c.tei?.trim()) { slug = c.next?.slug ?? null; continue }
      const { tei, ...meta } = c
      const node = (
        <ChapterArticle key={c.slug} book={book} bookTitle={bookTitle} authorName={authorName} chapter={meta} streamed plain={!isLongTei(tei)}>
          <TeiContent tei={tei} part={1} book={book} chapter={c.slug} titles={[meta.ur, meta.ar, meta.en].filter((x): x is string => !!x)} />
        </ChapterArticle>
      )
      return { node, slug: c.slug, next: c.next?.slug ?? null }
    }
    return { done: true }
  } catch (e) {
    console.error("[web] next chapter failed:", e instanceof Error ? e.message : e)
    return { error: true }
  }
}
