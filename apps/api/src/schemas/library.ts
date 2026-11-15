import { z } from "zod"
import { titleFields } from "./common.js"

const s = (d: string) => z.string().describe(d)
const ns = (d: string) => z.string().nullable().describe(d)

export const categorySchema = z
  .object({
    id: z.number().int().describe("Category id"),
    slug: s("Category slug"),
    titleEn: s("English title"),
    titleAr: ns("Arabic title"),
    titleUr: ns("Urdu title"),
    description: ns("Description"),
    sort: z.number().int().describe("Display order"),
    bookCount: z.number().int().describe("Number of published books"),
  })
  .describe("Category")

export const authorSchema = z
  .object({
    id: z.number().int().describe("Author id"),
    slug: s("Author slug"),
    nameEn: s("English name"),
    nameAr: ns("Arabic name"),
    nameUr: ns("Urdu name"),
    birthYear: z.number().int().nullable().describe("Birth year (Gregorian)"),
    deathYear: z.number().int().nullable().describe("Death year (Gregorian)"),
    bio: ns("Biography"),
    bookCount: z.number().int().describe("Number of published books"),
  })
  .describe("Author")

const authorRef = z
  .object({
    id: z.number().int().describe("Author id"),
    slug: s("Author slug"),
    nameEn: s("English name"),
    nameAr: ns("Arabic name"),
    nameUr: ns("Urdu name"),
  })
  .describe("Author summary")

const categoryRef = z
  .object({
    id: z.number().int().describe("Category id"),
    slug: s("Category slug"),
    titleEn: s("English title"),
    titleAr: ns("Arabic title"),
    titleUr: ns("Urdu title"),
  })
  .describe("Category summary")

export const bookSchema = z
  .object({
    id: z.number().int().describe("Book id"),
    slug: s("Book slug"),
    titleEn: s("English title"),
    titleAr: ns("Arabic title"),
    titleUr: ns("Urdu title"),
    description: ns("Description"),
    languages: z.array(z.string()).describe("Languages of the text, e.g. [\"ar\",\"ur\"]"),
    coverImage: ns("Cover image path under the web public folder"),
    volumeCount: z.number().int().describe("Number of volumes"),
    createdAt: z.string().describe("ISO creation date"),
    author: authorRef,
    category: categoryRef,
  })
  .describe("Book")

export const volumeSchema = z
  .object({
    id: z.number().int().describe("Volume id"),
    slug: s("Volume slug"),
    sort: z.number().int().describe("Display order"),
    ...titleFields,
    chapterCount: z.number().int().describe("Number of chapters in the volume"),
    topLevelCount: z.number().int().describe("Number of top-level entries (level 1) in the volume"),
  })
  .describe("Volume")

export const bookDetailSchema = bookSchema.extend({
  author: authorRef.extend({ prompt: ns("AI persona / system prompt of the author") }),
  volumes: z.array(volumeSchema).describe("Volumes ordered by sort"),
})

export const authorDetailSchema = authorSchema.extend({
  books: z.array(bookSchema).describe("Published books of the author"),
})

export const booksQuerySchema = z.object({
  authorSlug: z.string().max(100).optional().describe("Filter by author slug"),
  categorySlug: z.string().max(100).optional().describe("Filter by category slug"),
})

export const chapterListItemSchema = z
  .object({
    id: z.number().int().describe("Chapter id"),
    slug: s("Chapter slug"),
    sort: z.number().int().describe("Order among siblings"),
    parentId: z.number().int().nullable().describe("Parent chapter id"),
    volumeSlug: ns("Volume slug"),
    ...titleFields,
    level: z.number().int().describe("0 = group (title only, not readable), 1 = booklet (رسالہ), 2 = chapter, 3 = sub-topic inside a booklet/chapter"),
    anchorId: ns("Sub-topics only: id of the anchor inside the parent chapter's text"),
    hasChildren: z.boolean().describe("Whether it can be expanded: a booklet has chapters; other entries have child entries"),
    markdownChars: z.number().int().nullable().describe("Characters of the entry's own text as Markdown (level 1/2); null for groups, sub-topics and entries not backfilled yet"),
    subtreeChars: z.number().int().nullable().describe("Markdown characters of the entry plus everything below it (level 0/1/2); null for sub-topics or when a unit below is not backfilled yet"),
  })
  .describe("Chapter table-of-contents entry")

export const chaptersQuerySchema = z.object({
  volume: z.string().max(50).optional().describe("Volume slug"),
  parentId: z.coerce.number().int().positive().optional().describe("Parent chapter id; omit for top-level chapters"),
})

export const chapterParamsSchema = z.object({
  slug: s("Book slug"),
  chapterSlug: s("Chapter slug"),
})

const ref = z.object({ slug: s("Slug"), ...titleFields })
const redirectRef = z.object({ slug: s("Slug of the readable chapter"), anchorId: ns("Anchor to scroll to inside it") })
export const chapterDetailSchema = z
  .object({
    id: z.number().int().describe("Chapter id"),
    slug: s("Chapter slug"),
    ...titleFields,
    level: z.number().int().describe("0 = group, 1 = booklet, 2 = chapter, 3 = sub-topic"),
    anchorId: ns("Sub-topics only: anchor id inside the parent chapter's text"),
    redirect: redirectRef.nullable().describe("Set for level 0 (first readable entry of the group) and level 3 (parent + anchor): these have no text of their own"),
    volume: ref.nullable().describe("Containing volume"),
    breadcrumb: z.array(ref.extend({ id: z.number().int().describe("Chapter id"), level: z.number().int().describe("0 = group (not clickable), 1 = booklet, 2 = chapter") })).describe("Ancestors, root first, excluding the chapter itself"),
    prev: ref.nullable().describe("Previous chapter with content in reading order"),
    next: ref.nullable().describe("Next chapter with content in reading order"),
    tei: ns("TEI XML fragment (content slug 'default', else first content row)"),
  })
  .describe("Chapter with text")

export const contextUnitsQuerySchema = z.object({
  node: z.string().min(1).max(150).describe("Volume slug (wins) or chapter id; prefix with volume: or chapter: to disambiguate"),
})

export const chapterMarkdownSchema = z
  .object({
    id: z.number().int().describe("Chapter id"),
    slug: s("Chapter slug"),
    title: z.object({ en: ns("English title"), ar: ns("Arabic title"), ur: ns("Urdu title") }).describe("Chapter title per language"),
    breadcrumb: z
      .array(ref.extend({ id: z.number().int().describe("Chapter id"), level: z.number().int().describe("0 = group, 1 = booklet, 2 = chapter") }))
      .describe("Ancestors, root first, excluding the chapter itself"),
    markdown: s("Chapter text as compact Markdown (format: apps/api/docs/api-structure.md)"),
    chars: z.number().int().describe("Length of `markdown` in characters (= content.markdown_chars)"),
    updatedAt: s("ISO time the text was last changed; part of the client cache key"),
  })
  .describe("Chapter text as Markdown")

export const contextUnitSchema = z
  .object({
    id: z.number().int().describe("Chapter id of the unit"),
    slug: s("Chapter slug"),
    level: z.number().int().describe("1 = booklet (its own intro text), 2 = chapter"),
    ...titleFields,
    markdownChars: z.number().int().describe("Characters of the unit's Markdown"),
  })
  .describe("Selectable Ask-AI unit")

export const contextUnitsSchema = z
  .object({
    units: z.array(contextUnitSchema).describe("Units in reading order"),
    totalChars: z.number().int().describe("Sum of markdownChars"),
    maxChars: z.number().int().describe("Server cap in characters (AI_MAX_CONTEXT_TOKENS * 3)"),
    maxTokens: z.number().int().describe("Server cap in estimated tokens (ceil(chars / 3))"),
  })
  .describe("Context units below a node")
