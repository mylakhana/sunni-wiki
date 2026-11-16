/**
 * Rebuilds the content-search index (OpenSearch) from MySQL/TEI. The index is derived data: safe to re-run any time.
 *
 *   pnpm search:reindex --all                # every published book (+ removes docs of books no longer published)
 *   pnpm search:reindex --book <book-slug>   # one book (run after re-importing it)
 *   pnpm search:reindex --all --recreate     # drop + recreate both indices first (also automatic when the
 *                                            #   index schema version changed; --book refuses and asks for --all)
 *
 * Idempotent: documents have deterministic ids and a book's old documents are deleted first (scoped by bookId).
 * Needs OpenSearch running: `docker compose up -d opensearch` (repo root). Design: apps/api/docs/search-index.md
 */
import { Client } from "@opensearch-project/opensearch"
import { env } from "../src/config/env.js"
import { prisma } from "../src/config/prisma.js"
import { INDEX_SCHEMA_VERSION, chaptersIndexBody, indexNames, passagesIndexBody } from "../src/search/index-definition.js"
import { teiToPassages } from "../src/services/tei-passages.service.js"
import { ACTIVE_CHAPTER } from "../src/services/status.js"

const args = process.argv.slice(2)
const all = args.includes("--all")
const recreate = args.includes("--recreate")
const bookArg = args.includes("--book") ? args[args.indexOf("--book") + 1] : undefined
if (!all && !bookArg) {
  console.error("usage: pnpm search:reindex --all [--recreate] | --book <book-slug>")
  process.exit(2)
}

const client = new Client({ node: env.SEARCH_URL })
const names = indexNames(env.SEARCH_INDEX_PREFIX)
const bodies = { [names.passages]: passagesIndexBody, [names.chapters]: chaptersIndexBody }

async function ensureIndices() {
  for (const [index, body] of Object.entries(bodies)) {
    const exists = (await client.indices.exists({ index })).body
    let stale = recreate
    if (exists && !stale) {
      const m = (await client.indices.getMapping({ index })).body as Record<string, { mappings?: { _meta?: { schemaVersion?: number } } }>
      stale = m[index]?.mappings?._meta?.schemaVersion !== INDEX_SCHEMA_VERSION
    }
    if (exists && stale) {
      if (!all) throw new Error(`Index ${index} is missing/outdated: run "pnpm search:reindex --all --recreate" first.`)
      await client.indices.delete({ index })
      console.log(`  dropped ${index}`)
    }
    if (!exists || stale) {
      await client.indices.create({ index, body: body as never })
      console.log(`  created ${index}`)
    }
  }
}

const pick = (o: { titleUr: string | null; titleEn: string | null; titleAr: string | null }) => o.titleUr ?? o.titleEn ?? o.titleAr ?? ""

async function deleteBook(bookId: number) {
  for (const index of Object.values(names)) {
    await client.deleteByQuery({ index, body: { query: { term: { bookId } } }, refresh: true, conflicts: "proceed" })
  }
}

type Op = Record<string, unknown>
let pending: Op[] = []
let pendingBytes = 0
let indexed = { passages: 0, chapters: 0 }

async function flush() {
  if (!pending.length) return
  const res = await client.bulk({ body: pending as never })
  if (res.body.errors) {
    const bad = (res.body.items as Record<string, { error?: unknown; _id?: string }>[]).filter((i) => Object.values(i)[0]?.error)
    throw new Error(`bulk failed for ${bad.length} docs, first: ${JSON.stringify(Object.values(bad[0]!)[0])}`)
  }
  pending = []
  pendingBytes = 0
}

async function add(index: string, id: string, doc: Op) {
  const line = JSON.stringify(doc)
  pending.push({ index: { _index: index, _id: id } }, doc)
  pendingBytes += line.length
  if (pendingBytes > 6_000_000 || pending.length > 1000) await flush()
}

async function indexBook(book: { id: number; slug: string; authorId: number | null; categoryId: number; titleUr: string | null; titleEn: string | null; titleAr: string | null }) {
  await deleteBook(book.id)
  const tree = await prisma.chapter.findMany({
    where: { bookId: book.id },
    select: { id: true, parentId: true, titleUr: true, titleEn: true, titleAr: true },
  })
  const byId = new Map(tree.map((c) => [c.id, c]))
  const trail = (id: number | null) => {
    const t: string[] = []
    for (let d = 0; id != null && d < 20; d++) {
      const c = byId.get(id)
      if (!c) break
      t.unshift(pick(c))
      id = c.parentId
    }
    return t.filter(Boolean)
  }

  let lastId = 0
  let chapters = 0
  let passages = 0
  for (;;) {
    const rows = await prisma.chapter.findMany({
      where: { bookId: book.id, id: { gt: lastId }, ...ACTIVE_CHAPTER, contents: { some: {} } },
      orderBy: { id: "asc" },
      take: 10,
      select: {
        id: true, slug: true, level: true, volumeId: true, parentId: true, titleUr: true, titleEn: true, titleAr: true,
        volume: { select: { slug: true, titleUr: true, titleEn: true, titleAr: true } },
        contents: { orderBy: { slug: "asc" }, select: { tei: true } },
      },
    })
    if (!rows.length) break
    for (const ch of rows) {
      lastId = ch.id
      const crumb = [pick(book), ...(ch.volume ? [pick(ch.volume)] : []), ...trail(ch.id)].filter(Boolean)
      const base = {
        bookId: book.id, ...(ch.volumeId != null ? { volumeId: ch.volumeId } : {}), chapterId: ch.id,
        ...(book.authorId != null ? { authorId: book.authorId } : {}), categoryIds: [book.categoryId], level: ch.level,
        bookSlug: book.slug, ...(ch.volume ? { volumeSlug: ch.volume.slug } : {}), chapterSlug: ch.slug,
        ...(ch.titleUr ? { titleUr: ch.titleUr } : {}), ...(ch.titleAr ? { titleAr: ch.titleAr } : {}), ...(ch.titleEn ? { titleEn: ch.titleEn } : {}),
      }
      const list: ReturnType<typeof teiToPassages> = []
      for (const c of ch.contents) {
        const offset = list.length // several content rows per chapter: keep seq / parent links unique
        for (const p of teiToPassages(c.tei)) list.push({ ...p, seq: p.seq + offset, parentSeq: p.parentSeq + offset })
      }
      if (!list.length) continue

      // deterministic ids: <chapterId>:<anchorId> (first use of an anchor) else <chapterId>:<seq>
      const used = new Set<string>()
      const ids = list.map((p) => {
        const id = p.anchorId && !used.has(p.anchorId) ? `${ch.id}:${p.anchorId}` : `${ch.id}:${p.seq}`
        if (p.anchorId) used.add(p.anchorId)
        return id
      })
      for (const [i, p] of list.entries()) {
        await add(names.passages, ids[i]!, {
          ...base,
          passageId: ids[i], parentId: ids[p.parentSeq], seq: p.seq, chunkOrder: p.chunkOrder,
          ...(p.anchorId ? { anchorId: p.anchorId } : {}), ...(p.pageNo ? { pageNo: p.pageNo } : {}),
          lang: p.lang, role: p.role, ...(p.heading ? { heading: p.heading } : {}),
          breadcrumb: [...crumb, ...(p.heading && p.heading !== crumb[crumb.length - 1] ? [p.heading] : [])].join(" › "),
          text_ur: p.text_ur, text_ar: p.text_ar, text_en: p.text_en, display: p.display,
        })
      }
      await add(names.chapters, String(ch.id), {
        ...base, breadcrumb: crumb.join(" › "), passageCount: list.length,
        text_ur: list.map((p) => p.text_ur).filter(Boolean),
        text_ar: list.map((p) => p.text_ar).filter(Boolean),
        text_en: list.map((p) => p.text_en).filter(Boolean),
      })
      chapters++
      passages += list.length
    }
  }
  await flush()
  indexed.chapters += chapters
  indexed.passages += passages
  console.log(`  ${book.slug}: ${chapters} chapters, ${passages} passages`)
}

const t0 = Date.now()
try {
  await client.cluster.health({ timeout: "5s" })
} catch (e) {
  console.error(`OpenSearch not reachable at ${env.SEARCH_URL} (docker compose up -d opensearch): ${(e as Error).message}`)
  process.exit(1)
}
await ensureIndices()

const select = { id: true, slug: true, authorId: true, categoryId: true, titleUr: true, titleEn: true, titleAr: true, published: true } as const
if (all) {
  const books = await prisma.book.findMany({ where: { published: true }, orderBy: { id: "asc" }, select })
  for (const b of books) await indexBook(b)
  // drop docs of books that are no longer published / deleted
  for (const index of Object.values(names)) {
    await client.deleteByQuery({
      index,
      body: { query: { bool: { must_not: [{ terms: { bookId: books.map((b) => b.id) } }] } } },
      refresh: true,
      conflicts: "proceed",
    })
  }
} else {
  const b = await prisma.book.findUnique({ where: { slug: bookArg! }, select })
  if (!b) {
    console.error(`No book with slug "${bookArg}"`)
    process.exit(1)
  }
  if (b.published) await indexBook(b)
  else {
    await deleteBook(b.id)
    console.log(`  ${b.slug}: not published -> removed from the index`)
  }
}
await client.indices.refresh({ index: Object.values(names) })
const counts = await Promise.all(Object.values(names).map(async (index) => [index, (await client.count({ index })).body.count] as const))
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s — indexed ${indexed.chapters} chapters / ${indexed.passages} passages; index totals: ${counts.map(([i, n]) => `${i}=${n}`).join(", ")}`)
await prisma.$disconnect()
