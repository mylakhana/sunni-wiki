import { z } from "zod"

export const slugParamSchema = z.object({
  slug: z.string().min(1).max(150).describe("URL slug"),
})

export const paginationQuerySchema = (max = 200, def = 100) =>
  z.object({
    limit: z.coerce.number().int().min(1).max(max).default(def).describe(`Page size (1-${max}, default ${def})`),
    cursor: z.string().max(100).optional().describe("Opaque cursor from the previous page's nextCursor"),
  })

export const listOf = <T extends z.ZodType>(item: T) =>
  z
    .object({
      data: z.array(item).describe("Items of this page"),
      nextCursor: z.string().nullable().describe("Cursor for the next page, null when there is no more data"),
    })
    .describe("Paginated list")

export const single = <T extends z.ZodType>(item: T) =>
  z.object({ data: item.describe("The requested resource") }).describe("Single resource")

const nullableStr = (d: string) => z.string().nullable().describe(d)
export const titleFields = {
  titleEn: nullableStr("English title"),
  titleAr: nullableStr("Arabic title"),
  titleUr: nullableStr("Urdu title"),
}
