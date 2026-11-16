import type { FastifyInstance } from "fastify"
import type { z } from "zod"
import { SearchRequestError, SearchUnavailableError, searchIndex } from "../config/search.js"
import type { PrismaClient } from "../generated/prisma/client.js"
import type { searchQuerySchema, searchResponseSchema } from "../schemas/search.js"
import {
  type RawInnerHit,
  cleanQuery,
  facetAggs,
  fieldsFor,
  highlightSpec,
  parseIds,
  readFacet,
  scopeFilters,
  snippetMode,
  textQuery,
  toSnippets,
} from "./search-query.js"
import { ACTIVE_CHAPTER } from "./status.js"

type Query = z.infer<typeof searchQuerySchema>
type ChapterOut = z.infer<typeof searchResponseSchema>["groups"][number]["chapters"][number]
type Res<T> = { hits: { total: { value: number }; hits: T[] }; aggregations?: Record<string, unknown> }

const MAX_DEEP = 1000 // result window for sort=hits (bucketed aggregation)
const MAX_WINDOW = 10000 // OpenSearch default index.max_result_window

export class SearchService {
  constructor(
    private readonly db: PrismaClient,
    private readonly app: FastifyInstance,
  ) {}

  async search(q: Query) {
    const cleaned = cleanQuery(q.q)
    if ("error" in cleaned) throw this.app.httpErrors.badRequest(cleaned.error)
    const from = (q.page - 1) * q.pageSize
    if (from + q.pageSize > (q.sort === "hits" ? MAX_DEEP : MAX_WINDOW)) {
      throw this.app.httpErrors.badRequest("Page is too deep; narrow the search instead")
    }
    try {
      return await this.run(q, cleaned.text, from)
    } catch (e) {
      if (e instanceof SearchUnavailableError) throw this.app.httpErrors.serviceUnavailable(e.message)
      if (e instanceof SearchRequestError) this.app.log.error({ err: e }, "search request rejected")
      throw e
    }
  }

  private async run(q: Query, text: string, from: number) {
    const fields = fieldsFor(q.lang)
    const filter = scopeFilters({
      bookIds: parseIds(q.bookIds),
      volumeId: q.volumeId,
      chapterId: q.chapterId,
      authorId: q.authorId,
      categoryId: q.categoryId,
    })
    const chapterQuery = { bool: { filter, must: [textQuery(q.mode, text, fields)] } }
    const passageText = textQuery(snippetMode(q.mode), text, fields)

    // 1) matching chapters (this page), total and facets
    let ids: number[]
    let total: number
    let facets: ReturnType<typeof readFacets>
    if (q.sort === "hits") {
      const base = await searchIndex<Res<unknown>>("chapters", {
        size: 0,
        track_total_hits: true,
        query: chapterQuery,
        aggs: facetAggs,
      })
      total = base.hits.total.value
      facets = readFacets(base.aggregations)
      ids = await this.idsByHits(q, filter, passageText, chapterQuery, from)
    } else {
      const r = await searchIndex<Res<{ _source: { chapterId: number } }>>("chapters", {
        from,
        size: q.pageSize,
        track_total_hits: true,
        _source: ["chapterId"],
        query: chapterQuery,
        sort:
          q.sort === "canonical"
            ? [{ bookId: "asc" }, { chapterId: "asc" }]
            : [{ _score: "desc" }, { chapterId: "asc" }],
        aggs: facetAggs,
      })
      total = r.hits.total.value
      facets = readFacets(r.aggregations)
      ids = r.hits.hits.map((h) => h._source.chapterId)
    }

    // 2) snippets + passage hit counts for those chapters
    const perChapter = new Map<number, { hitCount: number; snippets: ReturnType<typeof toSnippets> }>()
    if (ids.length) {
      type Inner = { inner_hits: { p: { hits: { total: { value: number }; hits: RawInnerHit[] } } } }
      const r = await searchIndex<Res<Inner & { _source: { chapterId: number } }>>("passages", {
        size: ids.length,
        _source: ["chapterId"],
        query: { bool: { filter: [{ terms: { chapterId: ids } }], must: [passageText] } },
        collapse: {
          field: "chapterId",
          inner_hits: {
            name: "p",
            size: 3,
            sort: [{ _score: "desc" }],
            _source: ["anchorId"],
            highlight: highlightSpec(fields),
          },
        },
      })
      for (const h of r.hits.hits) {
        const p = h.inner_hits.p.hits
        perChapter.set(h._source.chapterId, { hitCount: p.total.value, snippets: toSnippets(p.hits, fields) })
      }
    }

    // 3) titles + safety guard: only active chapters of published books
    const rows = ids.length
      ? await this.db.chapter.findMany({
          where: { id: { in: ids }, ...ACTIVE_CHAPTER, book: { published: true } },
          select: {
            id: true,
            slug: true,
            titleEn: true,
            titleAr: true,
            titleUr: true,
            volume: { select: { slug: true } },
            book: { select: { id: true, slug: true, titleEn: true, titleAr: true, titleUr: true } },
          },
        })
      : []
    const byId = new Map(rows.map((r) => [r.id, r]))
    const bookTotals = new Map(facets.books.map((f) => [f.id, f.count]))

    const groups = new Map<number, { book: (typeof rows)[number]["book"]; hitCount: number; chapters: ChapterOut[] }>()
    for (const id of ids) {
      const row = byId.get(id)
      if (!row) continue
      const hit = perChapter.get(id) ?? { hitCount: 0, snippets: [] }
      const g = groups.get(row.book.id) ?? { book: row.book, hitCount: 0, chapters: [] }
      g.hitCount += hit.hitCount
      g.chapters.push({
        chapterId: row.id,
        slug: row.slug,
        titleEn: row.titleEn,
        titleAr: row.titleAr,
        titleUr: row.titleUr,
        volumeSlug: row.volume?.slug ?? null,
        hitCount: hit.hitCount,
        snippets: hit.snippets,
      })
      groups.set(row.book.id, g)
    }

    return {
      query: text,
      mode: q.mode,
      total,
      page: q.page,
      pageSize: q.pageSize,
      groups: [...groups.values()].map((g) => ({
        book: g.book,
        chapterCount: bookTotals.get(g.book.id) ?? g.chapters.length,
        hitCount: g.hitCount,
        chapters: g.chapters,
      })),
      facets,
    }
  }

  /**
   * sort=hits: rank chapters by number of matching passages (terms aggregation, capped at MAX_DEEP),
   * then keep only chapters that satisfy the chapter-level query (matters for mode=all).
   */
  private async idsByHits(q: Query, filter: object[], passageText: object, chapterQuery: object, from: number) {
    const agg = await searchIndex<Res<unknown>>("passages", {
      size: 0,
      query: { bool: { filter, must: [passageText] } },
      aggs: { by: { terms: { field: "chapterId", size: MAX_DEEP, order: { _count: "desc" } } } },
    })
    const ranked = ((agg.aggregations?.by as { buckets?: { key: number }[] })?.buckets ?? []).map((b) => Number(b.key))
    if (!ranked.length) return []
    const ok = await searchIndex<Res<{ _source: { chapterId: number } }>>("chapters", {
      size: ranked.length,
      _source: ["chapterId"],
      query: { bool: { filter: [{ terms: { chapterId: ranked } }], must: [(chapterQuery as { bool: { must: object[] } }).bool.must[0]!] } },
    })
    const keep = new Set(ok.hits.hits.map((h) => h._source.chapterId))
    return ranked.filter((id) => keep.has(id)).slice(from, from + q.pageSize)
  }
}

function readFacets(aggs: Record<string, unknown> | undefined) {
  return {
    books: readFacet(aggs?.books),
    authors: readFacet(aggs?.authors),
    categories: readFacet(aggs?.categories),
  }
}
