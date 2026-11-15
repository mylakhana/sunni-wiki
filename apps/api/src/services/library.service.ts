import type { FastifyInstance } from "fastify"
import type { PrismaClient } from "../generated/prisma/client.js"
import { decodeCursor, paginate } from "./pagination.js"

const publishedBooks = { where: { published: true } }

const bookSelect = {
  id: true,
  slug: true,
  titleEn: true,
  titleAr: true,
  titleUr: true,
  description: true,
  languages: true,
  coverImage: true,
  createdAt: true,
  author: { select: { id: true, slug: true, nameEn: true, nameAr: true, nameUr: true } },
  category: { select: { id: true, slug: true, titleEn: true, titleAr: true, titleUr: true } },
  _count: { select: { volumes: true } },
} as const

type BookRow = {
  languages: unknown
  createdAt: Date
  _count: { volumes: number }
} & Record<string, unknown>

function toBook<T extends BookRow>({ _count, languages, createdAt, ...rest }: T) {
  return {
    ...rest,
    languages: Array.isArray(languages) ? (languages as string[]) : [],
    volumeCount: _count.volumes,
    createdAt: createdAt.toISOString(),
  }
}

const authorSelect = {
  id: true,
  slug: true,
  nameEn: true,
  nameAr: true,
  nameUr: true,
  birthYear: true,
  deathYear: true,
  bio: true,
  _count: { select: { books: publishedBooks } },
} as const

function toAuthor<T extends { _count: { books: number } }>({ _count, ...rest }: T) {
  return { ...rest, bookCount: _count.books }
}

export class LibraryService {
  constructor(
    private readonly db: PrismaClient,
    private readonly app: Pick<FastifyInstance, "httpErrors">,
  ) {}

  async categories() {
    const rows = await this.db.category.findMany({
      orderBy: [{ sort: "asc" }, { id: "asc" }],
      select: {
        id: true,
        slug: true,
        titleEn: true,
        titleAr: true,
        titleUr: true,
        description: true,
        sort: true,
        _count: { select: { books: publishedBooks } },
      },
    })
    return { data: rows.map(({ _count, ...r }) => ({ ...r, bookCount: _count.books })) }
  }

  async authors(limit: number, cursor?: string) {
    const after = decodeCursor(cursor)
    const rows = await this.db.author.findMany({
      orderBy: { id: "asc" },
      take: limit + 1,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      select: authorSelect,
    })
    const page = paginate(rows, limit)
    return { data: page.data.map(toAuthor), nextCursor: page.nextCursor }
  }

  async author(slug: string) {
    const row = await this.db.author.findUnique({
      where: { slug },
      select: {
        ...authorSelect,
        books: { ...publishedBooks, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: bookSelect },
      },
    })
    if (!row) throw this.app.httpErrors.notFound("Author not found")
    const { books, ...author } = row
    return { data: { ...toAuthor(author), books: books.map(toBook) } }
  }

  async books(q: { authorSlug?: string; categorySlug?: string; limit: number; cursor?: string }) {
    const after = decodeCursor(q.cursor)
    const rows = await this.db.book.findMany({
      where: {
        published: true,
        ...(q.authorSlug ? { author: { slug: q.authorSlug } } : {}),
        ...(q.categorySlug ? { category: { slug: q.categorySlug } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      select: bookSelect,
    })
    const page = paginate(rows, q.limit)
    return { data: page.data.map(toBook), nextCursor: page.nextCursor }
  }

  async book(slug: string) {
    const row = await this.db.book.findFirst({
      where: { slug, published: true },
      select: {
        ...bookSelect,
        author: { select: { id: true, slug: true, nameEn: true, nameAr: true, nameUr: true, prompt: true } }, // detail only: the AI persona prompt
        volumes: {
          where: { status: "active" },
          orderBy: [{ sort: "asc" }, { id: "asc" }],
          select: {
            id: true,
            slug: true,
            sort: true,
            titleEn: true,
            titleAr: true,
            titleUr: true,
            _count: { select: { chapters: { where: { level: { in: [1, 2] }, status: "active" } } } },
          },
        },
      },
    })
    if (!row) throw this.app.httpErrors.notFound("Book not found")
    const { volumes, ...book } = row
    // booklets only (level 1): the count shown when the reader hides chapters/topics
    const tops = await this.db.chapter.groupBy({ by: ["volumeId"], where: { bookId: row.id, level: 1, status: "active" }, _count: { _all: true } })
    const topByVolume = new Map(tops.map((t) => [t.volumeId, t._count._all]))
    return {
      data: {
        ...toBook(book),
        volumes: volumes.map(({ _count, ...v }) => ({ ...v, chapterCount: _count.chapters, topLevelCount: topByVolume.get(v.id) ?? 0 })),
      },
    }
  }
}
