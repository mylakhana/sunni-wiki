import type { FastifyInstance } from "fastify"
import type { PrismaClient } from "../generated/prisma/client.js"
import { ACTIVE_CHAPTER } from "./status.js"
import type { ZipEntry } from "./zip.js"

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const BATCH = 50

/** Whole-book export: one TEI P5 document per volume (chapters in reading order), generated lazily. */
export class ExportService {
  constructor(
    private readonly db: PrismaClient,
    private readonly app: Pick<FastifyInstance, "httpErrors">,
  ) {}

  async book(slug: string) {
    const book = await this.db.book.findFirst({
      where: { slug, published: true },
      select: {
        id: true,
        slug: true,
        titleEn: true,
        titleAr: true,
        titleUr: true,
        author: { select: { nameEn: true } },
        volumes: { where: { status: "active" }, orderBy: [{ sort: "asc" }, { id: "asc" }], select: { id: true, slug: true, titleEn: true, titleAr: true, titleUr: true } },
      },
    })
    if (!book) throw this.app.httpErrors.notFound("Book not found")
    return book
  }

  /** Chapter ids of one volume (or of the volume-less chapters) in reading order: depth-first by sort. */
  private async orderedIds(bookId: number, volumeId: number | null): Promise<number[]> {
    const rows = await this.db.chapter.findMany({
      where: { bookId, volumeId, ...ACTIVE_CHAPTER },
      select: { id: true, parentId: true, sort: true },
    })
    const kids = new Map<number | null, typeof rows>()
    for (const c of rows) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c])
    for (const l of kids.values()) l.sort((a, b) => a.sort - b.sort || a.id - b.id)
    const ids = new Set(rows.map((r) => r.id))
    // roots: no parent, or parent outside this volume
    const roots = rows.filter((r) => r.parentId == null || !ids.has(r.parentId)).sort((a, b) => a.sort - b.sort || a.id - b.id)
    const out: number[] = []
    const stack = roots.slice().reverse()
    while (stack.length) {
      const c = stack.pop()!
      out.push(c.id)
      const k = kids.get(c.id)
      if (k) for (let i = k.length - 1; i >= 0; i--) stack.push(k[i]!)
    }
    return out
  }

  async *entries(book: Awaited<ReturnType<ExportService["book"]>>): AsyncGenerator<ZipEntry> {
    const bookTitle = book.titleEn
    const parts: { volumeId: number | null; file: string; title: string }[] = [
      ...book.volumes.map((v) => ({
        volumeId: v.id,
        file: `${book.slug}/volume-${v.slug}.tei.xml`,
        title: `${bookTitle} — ${v.titleEn || v.titleUr || v.titleAr || `Volume ${v.slug}`}`,
      })),
      { volumeId: null, file: `${book.slug}/book.tei.xml`, title: bookTitle },
    ]
    for (const p of parts) {
      const order = await this.orderedIds(book.id, p.volumeId)
      const chunks: string[] = []
      for (let i = 0; i < order.length; i += BATCH) {
        const ids = order.slice(i, i + BATCH)
        const rows = await this.db.content.findMany({ where: { chapterId: { in: ids } }, orderBy: [{ id: "asc" }], select: { chapterId: true, tei: true } })
        const byChapter = new Map<number, string[]>()
        for (const r of rows) byChapter.set(r.chapterId, [...(byChapter.get(r.chapterId) ?? []), r.tei])
        for (const id of ids) for (const t of byChapter.get(id) ?? []) chunks.push(t)
      }
      if (!chunks.length) continue
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:lang="ur">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>${esc(p.title)}</title>
        ${book.author ? `<author>${esc(book.author.nameEn)}</author>` : ""}
      </titleStmt>
      <publicationStmt><p>Exported from the library.</p></publicationStmt>
      <sourceDesc><p>${esc(bookTitle)}</p></sourceDesc>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
${chunks.join("\n")}
    </body>
  </text>
</TEI>
`
      yield { name: p.file, data: Buffer.from(xml, "utf8") }
    }
  }
}
