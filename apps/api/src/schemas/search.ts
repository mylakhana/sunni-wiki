import { z } from "zod"
import { titleFields } from "./common.js"

const idCsv = z
  .string()
  .regex(/^\d+(,\d+){0,99}$/, "Comma-separated numeric ids")
  .optional()

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200).describe("Search text (max 200 chars / 20 words)"),
  mode: z.enum(["all", "any", "phrase"]).default("all").describe("all = every word in the same chapter, any = at least one word, phrase = exact phrase"),
  lang: z.enum(["ur", "ar", "en", "all"]).default("all").describe("Search only this language's text"),
  bookIds: idCsv.describe("Scope: comma-separated book ids"),
  volumeId: z.coerce.number().int().positive().optional().describe("Scope: volume id"),
  chapterId: z.coerce.number().int().positive().optional().describe("Scope: chapter id"),
  authorId: z.coerce.number().int().positive().optional().describe("Scope: author id"),
  categoryId: z.coerce.number().int().positive().optional().describe("Scope: category id"),
  sort: z.enum(["relevance", "canonical", "hits"]).default("relevance").describe("relevance, canonical (book then chapter order) or hits (most matching passages first; max 1000 results deep)"),
  page: z.coerce.number().int().min(1).default(1).describe("1-based page of chapters"),
  pageSize: z.coerce.number().int().min(1).max(50).default(20).describe("Chapters per page (1-50)"),
})

const facetSchema = z.array(z.object({ id: z.number().int(), count: z.number().int() }))

export const searchResponseSchema = z
  .object({
    query: z.string().describe("The cleaned query that was run"),
    mode: z.enum(["all", "any", "phrase"]),
    total: z.number().int().describe("Total matching chapters (before the active/published guard)"),
    page: z.number().int(),
    pageSize: z.number().int(),
    groups: z
      .array(
        z.object({
          book: z.object({ id: z.number().int(), slug: z.string(), ...titleFields }),
          chapterCount: z.number().int().describe("Total matching chapters of this book (all pages)"),
          hitCount: z.number().int().describe("Matching passages in this page's chapters of the book"),
          chapters: z.array(
            z.object({
              chapterId: z.number().int(),
              slug: z.string(),
              ...titleFields,
              volumeSlug: z.string().nullable(),
              hitCount: z.number().int().describe("Matching passages in the chapter"),
              snippets: z
                .array(
                  z.object({
                    anchorId: z.string().nullable().describe("Jump target inside the chapter TEI"),
                    lang: z.enum(["ur", "ar", "en"]),
                    html: z.string().describe("HTML-escaped text with <mark> around hits"),
                    quote: z
                      .object({ q: z.string(), e: z.string().nullable() })
                      .nullable()
                      .describe("Text locating the hit paragraph: open the chapter with ?q=…&b=1 to highlight that paragraph"),
                  }),
                )
                .describe("Up to 3 highlighted snippets"),
            }),
          ),
        }),
      )
      .describe("This page's chapters grouped by book (order of first appearance)"),
    facets: z.object({ books: facetSchema, authors: facetSchema, categories: facetSchema }),
  })
  .describe("Content search result")
