/**
 * Fills content.markdown_chars (length of the TEI converted to Markdown) for content rows.
 *
 *   pnpm backfill:markdown          # only rows where markdown_chars IS NULL (new imports)
 *   pnpm backfill:markdown --all    # recompute every row (after changing the converter)
 *
 * Idempotent; keyset-paginated in small batches (some TEI rows are > 1 MB). Uses a raw UPDATE so
 * content.updatedAt (client cache key) is not touched.
 */
import { prisma } from "../src/config/prisma.js"
import { teiToMarkdown } from "../src/services/tei-markdown.service.js"

const all = process.argv.includes("--all")
const BATCH = 50

let lastId = 0
let done = 0
let failed = 0
const t0 = Date.now()

for (;;) {
  const rows = await prisma.content.findMany({
    where: { id: { gt: lastId }, ...(all ? {} : { markdownChars: null }) },
    orderBy: { id: "asc" },
    take: BATCH,
    select: { id: true, tei: true },
  })
  if (!rows.length) break
  for (const r of rows) {
    try {
      const chars = teiToMarkdown(r.tei).length
      await prisma.$executeRaw`UPDATE content SET markdown_chars = ${chars} WHERE id = ${r.id}`
      done++
    } catch (e) {
      failed++
      console.error(`content ${r.id}: ${(e as Error).message}`)
    }
  }
  lastId = rows[rows.length - 1]!.id
  if (done % 500 < BATCH) console.log(`  ${done} done (last id ${lastId})`)
}

const [{ nulls }] = await prisma.$queryRaw<{ nulls: bigint }[]>`SELECT COUNT(*) AS nulls FROM content WHERE markdown_chars IS NULL`
console.log(`markdown_chars: ${done} written, ${failed} failed, ${nulls} still NULL (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
await prisma.$disconnect()
process.exit(failed ? 1 : 0)
