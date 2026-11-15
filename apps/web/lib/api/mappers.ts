import { bookHue } from "@/lib/ui"
import type { Author, Book, BookDetail, Category, ChapterDetail, ChapterItem, ChapterLink, ContextUnits, Volume } from "@/lib/types"
import type { AuthorDto, BookDetailDto, BookDto, CategoryDto, ChapterDetailDto, ChapterLinkDto, ChapterListItemDto, ContextUnitsDto } from "./types"

/** Shown wherever a book has no author registered yet. */
export const UNKNOWN_AUTHOR = "Unknown author"

export const mapCategory = (c: CategoryDto): Category => ({
  id: c.slug, en: c.titleEn, ar: c.titleAr, ur: c.titleUr, desc: c.description, bookCount: c.bookCount,
})

export const mapAuthor = (a: AuthorDto): Author => ({
  id: a.slug, name: a.nameEn, ar: a.nameAr, ur: a.nameUr, bio: a.bio?.trim() || null, bookCount: a.bookCount,
  years: a.birthYear && a.deathYear ? `${a.birthYear} – ${a.deathYear}` : a.birthYear ? `b. ${a.birthYear}` : a.deathYear ? `d. ${a.deathYear}` : null,
})

export const mapBook = (b: BookDto): Book => ({
  id: b.slug, title: b.titleEn, ar: b.titleAr, ur: b.titleUr, blurb: b.description?.trim() || null,
  langs: b.languages, volumes: b.volumeCount, added: b.createdAt, cover: b.coverImage, hue: bookHue(b.slug),
  author: b.author?.slug ?? null, authorName: b.author?.nameEn ?? UNKNOWN_AUTHOR, cat: b.category.slug, catName: b.category.titleEn,
})

export const mapBookDetail = (b: BookDetailDto): BookDetail => ({
  ...mapBook(b),
  authorPrompt: b.author?.prompt?.trim() || null,
  volumeList: [...b.volumes].sort((x, y) => x.sort - y.sort).map((v): Volume => ({
    id: String(v.id), slug: v.slug, sort: v.sort, en: v.titleEn, ar: v.titleAr, ur: v.titleUr, chapterCount: v.chapterCount, topLevelCount: v.topLevelCount ?? v.chapterCount, // older cached API payloads lack it
  })),
})

export const mapChapterItem = (c: ChapterListItemDto): ChapterItem => ({
  id: String(c.id), slug: c.slug, parentId: c.parentId == null ? null : String(c.parentId), volume: c.volumeSlug, hasChildren: c.hasChildren, level: c.level,
  en: c.titleEn, ar: c.titleAr, ur: c.titleUr, chars: c.markdownChars ?? null, subtreeChars: c.subtreeChars ?? null,
})

const mapLink = (l: ChapterLinkDto | null): ChapterLink | null => (l ? { slug: l.slug, en: l.titleEn, ar: l.titleAr, ur: l.titleUr } : null)

export const mapChapter = (c: ChapterDetailDto): ChapterDetail => ({
  id: String(c.id), slug: c.slug, en: c.titleEn, ar: c.titleAr, ur: c.titleUr,
  volume: c.volume ? { slug: c.volume.slug, en: c.volume.titleEn, ar: c.volume.titleAr, ur: c.volume.titleUr } : null,
  level: c.level, redirect: c.redirect,
  breadcrumb: c.breadcrumb.map((b) => ({ id: String(b.id), slug: b.slug, level: b.level, en: b.titleEn, ar: b.titleAr, ur: b.titleUr })),
  prev: mapLink(c.prev), next: mapLink(c.next), tei: c.tei,
})

export const mapContextUnits = (d: ContextUnitsDto): ContextUnits => ({
  units: d.units.map((u) => ({ id: String(u.id), slug: u.slug, level: u.level, en: u.titleEn, ar: u.titleAr, ur: u.titleUr, chars: u.markdownChars })),
  totalChars: d.totalChars, maxChars: d.maxChars, maxTokens: d.maxTokens,
})
