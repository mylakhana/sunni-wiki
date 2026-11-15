/** UI types shared by server and client components (mapped from the API DTOs in lib/api/mappers.ts). */
export type Category = { id: string; en: string; ar: string | null; ur: string | null; desc: string | null; bookCount: number }

export type Author = {
  id: string // slug
  name: string
  ar: string | null
  ur: string | null
  years: string | null
  bio: string | null
  bookCount: number
}

export type Book = {
  id: string // slug
  title: string
  ar: string | null
  ur: string | null
  blurb: string | null
  langs: string[]
  volumes: number
  added: string // ISO date
  cover: string | null
  hue: [string, string]
  author: string | null // author slug (null = no author registered yet)
  authorName: string // "Unknown author" when there is none
  cat: string // category slug
  catName: string
}

export type Volume = { id: string; slug: string; sort: number; en: string | null; ar: string | null; ur: string | null; chapterCount: number; topLevelCount: number }
export type BookDetail = Book & { volumeList: Volume[]; authorPrompt: string | null /** AI persona prompt of the author */ }

/** Chapter title in each language (any may be missing). */
export type Titles = { en: string | null; ar: string | null; ur: string | null }

/** level: 0 = group (کتاب/باب heading; title only, not readable), 1 = booklet (رسالہ), 2 = chapter, 3 = sub-topic inside a booklet/chapter. */
export type ChapterLevel = 0 | 1 | 2 | 3
export type ChapterItem = Titles & { id: string; slug: string; parentId: string | null; volume: string | null; hasChildren: boolean; level: ChapterLevel
  /** Own Markdown size for the AI context (null: group / sub-topic / unknown) and self + descendant units (null: unknown). */
  chars: number | null; subtreeChars: number | null }
export type ChapterLink = Titles & { slug: string }
export type ChapterDetail = Titles & {
  id: string
  slug: string
  volume: ({ slug: string } & Titles) | null
  level: ChapterLevel
  /** Levels without text of their own: where to go instead (a group -> its first booklet/chapter, a sub-topic -> its parent + anchor). */
  redirect: { slug: string; anchorId: string | null } | null
  breadcrumb: (Titles & { id: string; slug: string; level: ChapterLevel })[]
  prev: ChapterLink | null
  next: ChapterLink | null
  tei: string | null
}

export type SearchIndex = {
  books: { id: string; title: string; ar: string | null; ur: string | null; authorName: string; hue: [string, string] }[]
  authors: { id: string; name: string; ar: string | null; ur: string | null }[]
}

/** Pick the best available title for display (English first). */
export const titleOf = (t: Titles, fallback = "Untitled") => t.en || t.ar || t.ur || fallback

/** A level 1/2 node that owns text: the selectable unit of "Ask AI" context. */
export type ContextUnit = Titles & { id: string; slug: string; level: ChapterLevel; chars: number }
export type ContextUnits = { units: ContextUnit[]; totalChars: number; maxChars: number; maxTokens: number }
