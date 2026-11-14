import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import type { Author, Book, BookDetail, Category, ChapterDetail, ChapterItem, SearchIndex } from "@/lib/types"
import { ApiError, apiAll, apiItem } from "./client"
import { mapAuthor, mapBook, mapBookDetail, mapCategory, mapChapter, mapChapterItem } from "./mappers"
import type { AuthorDetailDto, AuthorDto, BookDetailDto, BookDto, CategoryDto, ChapterDetailDto, ChapterListItemDto } from "./types"

/*
 * Caching approach
 * ----------------
 * Every loader is a `use cache` function with `cacheLife("hours")` (revalidate ~1h) and `cacheTag("library")`
 * (call revalidateTag("library") to refresh on demand). Entries live in the Next in-memory cache, i.e. per server instance.
 *
 * A failed API call must never be cached for an hour, and an error thrown inside a cache function aborts prerendering.
 * So on failure each loader returns `{ ok: false }` and switches to `cacheLife("seconds")`, which makes it a request-time
 * "dynamic hole" (excluded from the prerender, retried soon). The exported wrappers turn that back into an exception
 * (or into the empty/error states used by the pages).
 */
type Res<T> = { ok: true; value: T } | { ok: false }
const FAILED = { ok: false } as const
const log = (what: string, e: unknown) => console.error(`[web] ${what} failed:`, e instanceof Error ? e.message : e)

function unwrap<T>(r: Res<T>, what: string): T {
  if (!r.ok) throw new ApiError(0, `${what} is unavailable`)
  return r.value
}

export type Library = { books: Book[]; authors: Author[]; categories: Category[] }
export type LibraryResult = Library & { error: boolean }
const EMPTY: Library = { books: [], authors: [], categories: [] }

/** Every book, author and category (~1h, tag "library"). Never throws. */
async function cachedLibrary(): Promise<Res<Library>> {
  "use cache"
  try {
    const [books, authors, categories] = await Promise.all([
      apiAll<BookDto>("/books"),
      apiAll<AuthorDto>("/authors"),
      apiAll<CategoryDto>("/categories"),
    ])
    cacheLife("hours")
    cacheTag("library")
    return {
      ok: true,
      value: {
        books: books.map(mapBook),
        authors: authors.map(mapAuthor),
        categories: [...categories].sort((a, b) => a.sort - b.sort).map(mapCategory),
      },
    }
  } catch (e) {
    log("library", e)
    cacheLife("seconds")
    return FAILED
  }
}

/** The whole library for pages: on API failure returns empty lists with `error: true` (for an empty/error state). */
export async function loadLibrary(): Promise<LibraryResult> {
  const r = await cachedLibrary()
  return r.ok ? { ...r.value, error: false } : { ...EMPTY, error: true }
}

/** For generateStaticParams (build time): empty lists when the API is down. */
export async function getLibraryForBuild(): Promise<Library> {
  const r = await cachedLibrary()
  return r.ok ? r.value : EMPTY
}

/** Slim index for the command palette. */
export async function getSearchIndex(): Promise<SearchIndex> {
  const lib = await loadLibrary()
  return {
    books: lib.books.map((b) => ({ id: b.id, title: b.title, ar: b.ar, ur: b.ur, authorName: b.authorName, hue: b.hue })),
    authors: lib.authors.map((a) => ({ id: a.id, name: a.name, ar: a.ar, ur: a.ur })),
  }
}

async function cachedBook(slug: string): Promise<Res<BookDetail | null>> {
  "use cache"
  // v2: payload gained volumes[].topLevelCount (editing this body invalidates entries cached by the old shape)
  try {
    const value = mapBookDetail(await apiItem<BookDetailDto>(`/books/${encodeURIComponent(slug)}`))
    cacheLife("hours")
    cacheTag("library", `book:${slug}`)
    return { ok: true, value }
  } catch (e) {
    if (e instanceof ApiError && e.notFound) {
      cacheLife("minutes")
      return { ok: true, value: null }
    }
    log(`book ${slug}`, e)
    cacheLife("seconds")
    return FAILED
  }
}
/** One book with its volumes; `null` when it does not exist. Throws ApiError when the API is down. */
export const getBook = async (slug: string) => unwrap(await cachedBook(slug), "Book")

async function cachedAuthor(slug: string): Promise<Res<{ author: Author; books: Book[] } | null>> {
  "use cache"
  try {
    const a = await apiItem<AuthorDetailDto>(`/authors/${encodeURIComponent(slug)}`)
    cacheLife("hours")
    cacheTag("library", `author:${slug}`)
    return { ok: true, value: { author: mapAuthor(a), books: a.books.map(mapBook) } }
  } catch (e) {
    if (e instanceof ApiError && e.notFound) {
      cacheLife("minutes")
      return { ok: true, value: null }
    }
    log(`author ${slug}`, e)
    cacheLife("seconds")
    return FAILED
  }
}
/** One author with their books; `null` when missing. */
export const getAuthor = async (slug: string) => unwrap(await cachedAuthor(slug), "Writer")

async function cachedChapters(book: string, volume: string | null, parentId: string | null): Promise<Res<ChapterItem[]>> {
  "use cache"
  // v2: levels renumbered (booklets added) — changing this function drops entries cached under the old numbering
  try {
    const items = await apiAll<ChapterListItemDto>(`/books/${encodeURIComponent(book)}/chapters`, { volume, parentId }, 500)
    cacheLife("hours")
    cacheTag("library", `book:${book}`)
    return { ok: true, value: items.map(mapChapterItem) }
  } catch (e) {
    log(`chapters of ${book}`, e)
    cacheLife("seconds")
    return FAILED
  }
}
/** One level of a book's table of contents (no text), loaded lazily per volume / parent. Items carry `level` (0 group, 1 booklet, 2 chapter, 3 sub-topic). */
export const getChapters = async (book: string, volume: string | null, parentId: string | null) =>
  unwrap(await cachedChapters(book, volume, parentId), "Chapter list")

async function cachedChapter(book: string, chapter: string): Promise<Res<ChapterDetail | null>> {
  "use cache"
  // v2: levels renumbered (booklets added)
  try {
    const value = mapChapter(await apiItem<ChapterDetailDto>(`/books/${encodeURIComponent(book)}/chapters/${encodeURIComponent(chapter)}`))
    cacheLife("hours")
    cacheTag("library", `book:${book}`)
    return { ok: true, value }
  } catch (e) {
    if (e instanceof ApiError && e.notFound) {
      cacheLife("minutes")
      return { ok: true, value: null }
    }
    log(`chapter ${book}/${chapter}`, e)
    cacheLife("seconds")
    return FAILED
  }
}
/** One chapter incl. its TEI text (can reach ~1.8 MB); `null` when missing. */
export const getChapter = async (book: string, chapter: string) => unwrap(await cachedChapter(book, chapter), "Chapter")

/** First readable chapter of a book (drills down through level-0 groups). `null` if none. */
export async function getFirstChapterSlug(book: BookDetail): Promise<string | null> {
  try {
    let parent: string | null = null
    let volume: string | null = book.volumeList[0]?.slug ?? null
    for (let depth = 0; depth < 6; depth++) {
      const items: ChapterItem[] = await getChapters(book.id, volume, parent)
      const first = items[0]
      if (!first) return null
      if (first.level !== 0) return first.slug // a chapter (its children are only sub-topics): readable
      parent = first.id
      volume = null
    }
    return null
  } catch {
    return null
  }
}
