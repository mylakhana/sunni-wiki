import type { FastifyInstance } from "fastify"
import type { PrismaClient } from "../generated/prisma/client.js"
import { decodeCursor, paginate } from "./pagination.js"

type Titles = { titleEn: string | null; titleAr: string | null; titleUr: string | null }
type OrderEntry = { id: number; slug: string } & Titles

const TITLES = { titleEn: true, titleAr: true, titleUr: true } as const
const ORDER_TTL_MS = 5 * 60_000

/**
 * Reading order of a book: volumes by sort (volume-less chapters last), within
 * each volume a depth-first walk of the chapter tree (siblings by sort, id).
 * Only chapters that have content are kept (they are what prev/next link to).
 * Computed once per book and cached in memory for a few minutes.
 */
export class ChapterService {
  private orderCache = new Map<number, { at: number; entries: OrderEntry[]; index: Map<number, number> }>()

  constructor(
    private readonly db: PrismaClient,
    private readonly app: Pick<FastifyInstance, "httpErrors">,
  ) {}

  private async publishedBook(slug: string) {
    const book = await this.db.book.findFirst({ where: { slug, published: true }, select: { id: true } })
    if (!book) throw this.app.httpErrors.notFound("Book not found")
    return book
  }

  async list(slug: string, q: { volume?: string; parentId?: number; limit: number; cursor?: string }) {
    const book = await this.publishedBook(slug)
    let volumeId: number | undefined
    if (q.volume) {
      const v = await this.db.volume.findUnique({
        where: { bookId_slug: { bookId: book.id, slug: q.volume } },
        select: { id: true },
      })
      if (!v) throw this.app.httpErrors.notFound("Volume not found")
      volumeId = v.id
    }
    const after = decodeCursor(q.cursor)
    const rows = await this.db.chapter.findMany({
      where: {
        bookId: book.id,
        parentId: q.parentId ?? null,
        ...(volumeId ? { volumeId } : {}),
      },
      orderBy: [{ sort: "asc" }, { id: "asc" }],
      take: q.limit + 1,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      select: {
        id: true,
        slug: true,
        sort: true,
        parentId: true,
        level: true,
        anchorId: true,
        ...TITLES,
        volume: { select: { slug: true } },
        _count: { select: { children: true } },
      },
    })
    const page = paginate(rows, q.limit)
    // A booklet is expandable only if it has chapters (its other children are just sub-topic anchors).
    const bookletIds = page.data.filter((c) => c.level === 1).map((c) => c.id)
    const withChapters = new Set<number>()
    if (bookletIds.length) {
      const g = await this.db.chapter.groupBy({ by: ["parentId"], where: { parentId: { in: bookletIds }, level: 2 }, _count: { _all: true } })
      for (const x of g) if (x.parentId != null) withChapters.add(x.parentId)
    }
    return {
      data: page.data.map(({ volume, _count, ...c }) => ({
        ...c,
        volumeSlug: volume?.slug ?? null,
        hasChildren: c.level === 1 ? withChapters.has(c.id) : _count.children > 0,
      })),
      nextCursor: page.nextCursor,
    }
  }

  private async readingOrder(bookId: number) {
    const hit = this.orderCache.get(bookId)
    if (hit && Date.now() - hit.at < ORDER_TTL_MS) return hit
    const [volumes, chapters, withContent] = await Promise.all([
      this.db.volume.findMany({ where: { bookId }, select: { id: true, sort: true } }),
      this.db.chapter.findMany({
        where: { bookId },
        select: { id: true, slug: true, sort: true, parentId: true, volumeId: true, ...TITLES },
      }),
      this.db.content.findMany({ where: { chapter: { bookId } }, select: { chapterId: true } }),
    ])
    const hasContent = new Set(withContent.map((c) => c.chapterId))
    const volSort = new Map(volumes.map((v) => [v.id, v.sort]))
    const children = new Map<number | null, typeof chapters>()
    for (const c of chapters) {
      const key = c.parentId
      const list = children.get(key)
      if (list) list.push(c)
      else children.set(key, [c])
    }
    for (const list of children.values()) list.sort((a, b) => a.sort - b.sort || a.id - b.id)

    const roots = (children.get(null) ?? []).slice().sort((a, b) => {
      const va = a.volumeId == null ? Infinity : (volSort.get(a.volumeId) ?? Infinity)
      const vb = b.volumeId == null ? Infinity : (volSort.get(b.volumeId) ?? Infinity)
      return va - vb || a.sort - b.sort || a.id - b.id
    })

    const entries: OrderEntry[] = []
    const stack = roots.slice().reverse()
    while (stack.length) {
      const c = stack.pop()!
      if (hasContent.has(c.id)) {
        entries.push({ id: c.id, slug: c.slug, titleEn: c.titleEn, titleAr: c.titleAr, titleUr: c.titleUr })
      }
      const kids = children.get(c.id)
      if (kids) for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!)
    }
    const index = new Map(entries.map((e, i) => [e.id, i]))
    const value = { at: Date.now(), entries, index }
    this.orderCache.set(bookId, value)
    return value
  }

  /** Slug of the first readable entry (booklet or chapter) below a group, descending through nested groups (کتاب → باب → booklet). */
  private async firstChapterUnder(groupId: number, depth = 0): Promise<string | null> {
    if (depth > 6) return null
    const kids = await this.db.chapter.findMany({
      where: { parentId: groupId, level: { in: [0, 1, 2] } },
      orderBy: [{ sort: "asc" }, { id: "asc" }],
      select: { id: true, slug: true, level: true },
    })
    for (const k of kids) {
      if (k.level !== 0) return k.slug
      const nested = await this.firstChapterUnder(k.id, depth + 1)
      if (nested) return nested
    }
    return null
  }

  async detail(slug: string, chapterSlug: string) {
    const book = await this.publishedBook(slug)
    const chapter = await this.db.chapter.findUnique({
      where: { bookId_slug: { bookId: book.id, slug: chapterSlug } },
      select: {
        id: true,
        slug: true,
        parentId: true,
        level: true,
        anchorId: true,
        ...TITLES,
        volume: { select: { slug: true, ...TITLES } },
        contents: { orderBy: [{ id: "asc" }], select: { slug: true, tei: true } },
      },
    })
    if (!chapter) throw this.app.httpErrors.notFound("Chapter not found")

    const breadcrumb: { id: number; slug: string; level: number; titleEn: string | null; titleAr: string | null; titleUr: string | null }[] = []
    let parentId = chapter.parentId
    for (let depth = 0; parentId != null && depth < 20; depth++) {
      const p = await this.db.chapter.findUnique({
        where: { id: parentId },
        select: { id: true, slug: true, parentId: true, level: true, ...TITLES },
      })
      if (!p) break
      const { parentId: next, ...ref } = p
      breadcrumb.unshift(ref)
      parentId = next
    }

    const order = await this.readingOrder(book.id)
    const pos = order.index.get(chapter.id)
    let prev: OrderEntry | null = null
    let next: OrderEntry | null = null
    if (pos != null) {
      prev = order.entries[pos - 1] ?? null
      next = order.entries[pos + 1] ?? null
    } else {
      // Chapter without content: no neighbours in a content-only order.
    }
    const strip = (e: OrderEntry | null) => (e ? { slug: e.slug, titleEn: e.titleEn, titleAr: e.titleAr, titleUr: e.titleUr } : null)
    const content = chapter.contents.find((c) => c.slug === "default") ?? chapter.contents[0]

    // Levels without text of their own point the reader at the chapter that has it:
    // a group (0) -> its first booklet/chapter; a sub-topic (3) -> its parent + anchor.
    let redirect: { slug: string; anchorId: string | null } | null = null
    if (chapter.level === 3 && chapter.parentId != null) {
      const parent = breadcrumb[breadcrumb.length - 1]
      if (parent) redirect = { slug: parent.slug, anchorId: chapter.anchorId }
    } else if (chapter.level === 0) {
      const first = await this.firstChapterUnder(chapter.id)
      if (first) redirect = { slug: first, anchorId: null }
    }

    return {
      data: {
        id: chapter.id,
        slug: chapter.slug,
        titleEn: chapter.titleEn,
        titleAr: chapter.titleAr,
        titleUr: chapter.titleUr,
        level: chapter.level,
        anchorId: chapter.anchorId,
        redirect,
        volume: chapter.volume,
        breadcrumb,
        prev: strip(prev),
        next: strip(next),
        tei: content?.tei ?? null,
      },
    }
  }
}
