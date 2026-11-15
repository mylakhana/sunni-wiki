import type { FastifyInstance } from "fastify"
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi"
import { prisma } from "../../config/prisma.js"
import { CACHE } from "../../middleware/http-cache.js"
import { listOf, paginationQuerySchema, single, slugParamSchema } from "../../schemas/common.js"
import {
  bookDetailSchema,
  bookSchema,
  booksQuerySchema,
  chapterDetailSchema,
  chapterListItemSchema,
  chapterParamsSchema,
  chaptersQuerySchema,
} from "../../schemas/library.js"
import { ChapterService } from "../../services/chapter.service.js"
import { ExportService } from "../../services/export.service.js"
import { zipStream } from "../../services/zip.js"
import { Readable } from "node:stream"
import { LibraryService } from "../../services/library.service.js"

export default async function booksRoute(app: FastifyInstance) {
  const library = new LibraryService(prisma, app)
  const chapters = new ChapterService(prisma, app)
  const exporter = new ExportService(prisma, app)
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>()

  r.get(
    "/books",
    {
      config: { cache: CACHE.list },
      schema: {
        tags: ["books"],
        summary: "List published books (newest first, paginated)",
        querystring: paginationQuerySchema().extend(booksQuerySchema.shape),
        response: { 200: listOf(bookSchema) },
      },
    },
    async (req) => library.books(req.query),
  )

  r.get(
    "/books/:slug",
    {
      config: { cache: CACHE.detail },
      schema: {
        tags: ["books"],
        summary: "Book detail with volumes",
        params: slugParamSchema,
        response: { 200: single(bookDetailSchema) },
      },
    },
    async (req) => library.book(req.params.slug),
  )

  r.get(
    "/books/:slug/chapters",
    {
      config: { cache: CACHE.list },
      schema: {
        tags: ["chapters"],
        summary: "Table of contents (no text): children of parentId, or top-level chapters",
        params: slugParamSchema,
        querystring: paginationQuerySchema(500).extend(chaptersQuerySchema.shape),
        response: { 200: listOf(chapterListItemSchema) },
      },
    },
    async (req) => chapters.list(req.params.slug, req.query),
  )

  r.get(
    "/books/:slug/chapters/:chapterSlug",
    {
      config: { cache: CACHE.chapter },
      schema: {
        tags: ["chapters"],
        summary: "One chapter with TEI text, breadcrumb and prev/next",
        params: chapterParamsSchema,
        response: { 200: single(chapterDetailSchema) },
      },
    },
    async (req) => chapters.detail(req.params.slug, req.params.chapterSlug),
  )

  r.get(
    "/books/:slug/export",
    {
      schema: {
        tags: ["books"],
        summary: "Download the whole book as a ZIP of TEI XML files (one per volume)",
        params: slugParamSchema,
      },
    },
    async (req, reply) => {
      const book = await exporter.book(req.params.slug)
      return reply
        .header("content-type", "application/zip")
        .header("content-disposition", `attachment; filename="${book.slug}-tei.zip"`)
        .header("content-encoding", "identity") // already compressed: skip @fastify/compress
        .send(Readable.from(zipStream(exporter.entries(book))))
    },
  )
}
