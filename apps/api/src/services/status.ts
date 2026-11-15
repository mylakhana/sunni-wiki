import type { Prisma } from "../generated/prisma/client.js"

/** Prisma filter hiding inactive chapters and every chapter of an inactive volume. */
export const ACTIVE_CHAPTER: Prisma.ChapterWhereInput = {
  status: "active",
  OR: [{ volumeId: null }, { volume: { is: { status: "active" } } }],
}
