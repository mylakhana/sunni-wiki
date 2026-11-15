import type { PrismaClient } from "../generated/prisma/client.js"

export type BreadcrumbItem = {
  id: number
  slug: string
  level: number
  titleEn: string | null
  titleAr: string | null
  titleUr: string | null
}

/** Ancestors of a chapter (root first), given its parentId. */
export async function breadcrumbOf(db: PrismaClient, parentId: number | null): Promise<BreadcrumbItem[]> {
  const out: BreadcrumbItem[] = []
  for (let depth = 0; parentId != null && depth < 20; depth++) {
    const p = await db.chapter.findUnique({
      where: { id: parentId },
      select: { id: true, slug: true, parentId: true, level: true, titleEn: true, titleAr: true, titleUr: true },
    })
    if (!p) break
    const { parentId: next, ...ref } = p
    out.unshift(ref)
    parentId = next
  }
  return out
}
