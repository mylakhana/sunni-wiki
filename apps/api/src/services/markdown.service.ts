import type { FastifyInstance } from "fastify"
import type { PrismaClient } from "../generated/prisma/client.js"
import { breadcrumbOf } from "./breadcrumb.js"
import { teiToMarkdown } from "./tei-markdown.service.js"

/** In-memory LRU of converted Markdown, bounded by entries and total characters. */
class MarkdownLru {
  private map = new Map<string, string>()
  private chars = 0
  constructor(
    private readonly maxEntries = 300,
    private readonly maxChars = 40_000_000,
  ) {}
  get(key: string) {
    const v = this.map.get(key)
    if (v === undefined) return undefined
    this.map.delete(key)
    this.map.set(key, v)
    return v
  }
  set(key: string, value: string) {
    const old = this.map.get(key)
    if (old !== undefined) this.chars -= old.length
    this.map.delete(key)
    this.map.set(key, value)
    this.chars += value.length
    while (this.map.size > this.maxEntries || this.chars > this.maxChars) {
      const first = this.map.keys().next()
      if (first.done || first.value === key) break
      this.chars -= this.map.get(first.value)!.length
      this.map.delete(first.value)
    }
  }
}

/** TEI -> Markdown for stored content: LRU keyed by content id + updatedAt, and lazy `markdown_chars`. */
export class MarkdownService {
  private lru = new MarkdownLru()

  constructor(
    private readonly db: PrismaClient,
    private readonly app: Pick<FastifyInstance, "httpErrors">,
    private readonly onChars: (contentId: number) => void = () => {},
  ) {}

  /** Raw UPDATE on purpose: the Prisma client would bump `updatedAt`, which is the cache key. */
  private async storeChars(contentId: number, chars: number) {
    await this.db.$executeRaw`UPDATE content SET markdown_chars = ${chars} WHERE id = ${contentId}`
    this.onChars(contentId)
  }

  /** Markdown of one content row (cached). */
  async convert(contentId: number, updatedAt: Date): Promise<string> {
    const key = `${contentId}:${updatedAt.getTime()}`
    const hit = this.lru.get(key)
    if (hit !== undefined) return hit
    const row = await this.db.content.findUnique({ where: { id: contentId }, select: { tei: true } })
    if (!row) throw this.app.httpErrors.notFound("Content not found")
    let md: string
    try {
      md = teiToMarkdown(row.tei)
    } catch {
      throw this.app.httpErrors.unprocessableEntity("Chapter text could not be converted")
    }
    this.lru.set(key, md)
    return md
  }

  /** Size of a content row's Markdown, computing and storing it when still NULL. */
  async ensureChars(contentId: number): Promise<number> {
    const row = await this.db.content.findUnique({ where: { id: contentId }, select: { markdownChars: true, updatedAt: true } })
    if (!row) throw this.app.httpErrors.notFound("Content not found")
    if (row.markdownChars != null) return row.markdownChars
    const chars = (await this.convert(contentId, row.updatedAt)).length
    await this.storeChars(contentId, chars)
    return chars
  }

  async chapter(bookSlug: string, chapterSlug: string) {
    const book = await this.db.book.findFirst({ where: { slug: bookSlug, published: true }, select: { id: true } })
    if (!book) throw this.app.httpErrors.notFound("Book not found")
    const ch = await this.db.chapter.findUnique({
      where: { bookId_slug: { bookId: book.id, slug: chapterSlug } },
      select: {
        id: true,
        slug: true,
        parentId: true,
        titleEn: true,
        titleAr: true,
        titleUr: true,
        contents: { orderBy: [{ id: "asc" }], select: { id: true, slug: true, updatedAt: true, markdownChars: true } },
      },
    })
    if (!ch) throw this.app.httpErrors.notFound("Chapter not found")
    const content = ch.contents.find((c) => c.slug === "default") ?? ch.contents[0]
    if (!content) throw this.app.httpErrors.notFound("Chapter has no text")

    const markdown = await this.convert(content.id, content.updatedAt)
    if (content.markdownChars !== markdown.length) await this.storeChars(content.id, markdown.length)

    return {
      data: {
        id: ch.id,
        slug: ch.slug,
        title: { en: ch.titleEn, ar: ch.titleAr, ur: ch.titleUr },
        breadcrumb: await breadcrumbOf(this.db, ch.parentId),
        markdown,
        chars: markdown.length,
        updatedAt: content.updatedAt.toISOString(),
      },
    }
  }
}
