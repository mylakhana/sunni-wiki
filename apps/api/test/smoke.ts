import assert from "node:assert/strict"
import { buildApp } from "../src/app.js"
import { prisma } from "../src/config/prisma.js"

const app = await buildApp()
let n = 0
async function t(name: string, fn: () => Promise<void>) {
  await fn()
  n++
  console.log(`ok - ${name}`)
}
const get = (url: string, headers: Record<string, string> = {}) => app.inject({ method: "GET", url, headers })
const json = (r: { body: string }) => JSON.parse(r.body)

let bookSlug = ""
let chapterSlug = ""

await t("health", async () => {
  const r = await get("/v1/health")
  assert.equal(r.statusCode, 200)
  assert.equal(json(r).database, "up")
})

await t("categories", async () => {
  const r = await get("/v1/categories")
  assert.equal(r.statusCode, 200)
  assert.match(String(r.headers["cache-control"]), /public, max-age=300, s-maxage=300, stale-while-revalidate/)
  const { data } = json(r)
  assert.ok(data.length >= 1)
  assert.equal(typeof data[0].bookCount, "number")
})

await t("authors list + detail + 404", async () => {
  const r = await get("/v1/authors")
  const { data, nextCursor } = json(r)
  assert.equal(r.statusCode, 200)
  assert.equal(nextCursor, null)
  assert.ok(data[0].bookCount >= 1)
  const d = await get(`/v1/authors/${data[0].slug}`)
  assert.equal(d.statusCode, 200)
  assert.ok(Array.isArray(json(d).data.books))
  assert.equal((await get("/v1/authors/nope")).statusCode, 404)
})

await t("books list, filters, pagination", async () => {
  const r = await get("/v1/books?limit=1")
  assert.equal(r.statusCode, 200)
  const { data } = json(r)
  assert.equal(data.length, 1)
  bookSlug = data[0].slug
  assert.ok(Array.isArray(data[0].languages))
  assert.equal(typeof data[0].volumeCount, "number")
  assert.ok(data[0].author.slug && data[0].category.slug)
  const f = json(await get(`/v1/books?authorSlug=${data[0].author.slug}&categorySlug=${data[0].category.slug}`))
  assert.ok(f.data.length >= 1)
  assert.equal(json(await get("/v1/books?authorSlug=nobody")).data.length, 0)
  const p = json(await get("/v1/authors?limit=1&cursor=" + Buffer.from("id:0").toString("base64url")))
  assert.ok(p.data.length <= 1)
})

await t("book detail + unpublished/unknown 404", async () => {
  const r = await get(`/v1/books/${bookSlug}`)
  assert.equal(r.statusCode, 200)
  const { data } = json(r)
  assert.ok(data.volumes.length > 0)
  assert.ok(data.volumes[0].sort <= data.volumes[1].sort)
  assert.equal((await get("/v1/books/nope")).statusCode, 404)
})

await t("chapters TOC", async () => {
  const top = json(await get(`/v1/books/${bookSlug}/chapters?volume=1a&limit=5`))
  assert.ok(top.data.length > 0 && top.data.length <= 5)
  assert.equal(top.data[0].parentId, null)
  assert.equal(top.data[0].volumeSlug, "1a")
  assert.ok(!("tei" in top.data[0]))
  const withKids = top.data.find((c: { hasChildren: boolean }) => c.hasChildren)
  if (top.nextCursor) {
    const p2 = json(await get(`/v1/books/${bookSlug}/chapters?volume=1a&limit=5&cursor=${top.nextCursor}`))
    assert.ok(p2.data[0].id !== top.data[0].id)
  }
  if (withKids) {
    const kids = json(await get(`/v1/books/${bookSlug}/chapters?parentId=${withKids.id}`))
    assert.ok(kids.data.length > 0 && kids.data.every((c: { parentId: number }) => c.parentId === withKids.id))
    const leaf = kids.data.find((c: { hasChildren: boolean }) => !c.hasChildren) ?? kids.data[0]
    chapterSlug = leaf.slug
  } else chapterSlug = top.data[0].slug
  assert.equal((await get(`/v1/books/${bookSlug}/chapters?volume=zzz`)).statusCode, 404)
  assert.equal((await get(`/v1/books/${bookSlug}/chapters?limit=501`)).statusCode, 400)
})

await t("chapter detail, breadcrumb, prev/next, ETag/304, compression", async () => {
  const r = await get(`/v1/books/${bookSlug}/chapters/${chapterSlug}`, { "accept-encoding": "gzip" })
  assert.equal(r.statusCode, 200)
  assert.match(String(r.headers["cache-control"]), /max-age=3600/)
  assert.match(String(r.headers.etag), /^W\//)
  const { data } = json(await get(`/v1/books/${bookSlug}/chapters/${chapterSlug}`))
  assert.equal(data.slug, chapterSlug)
  assert.ok(Array.isArray(data.breadcrumb))
  if (data.tei) {
    assert.ok(data.next || data.prev)
    const nb = data.next ?? data.prev
    assert.equal((await get(`/v1/books/${bookSlug}/chapters/${nb.slug}`)).statusCode, 200)
  }
  const r304 = await get(`/v1/books/${bookSlug}/chapters/${chapterSlug}`, { "if-none-match": String(r.headers.etag) })
  assert.equal(r304.statusCode, 304)
  assert.equal((await get(`/v1/books/${bookSlug}/chapters/nope`)).statusCode, 404)
})

await t("big chapter is gzip-compressed", async () => {
  const big = await prisma.$queryRaw<{ slug: string }[]>`SELECT ch.slug FROM chapters ch JOIN content c ON c.chapterId=ch.id ORDER BY LENGTH(c.tei) DESC LIMIT 1`
  const r = await get(`/v1/books/${bookSlug}/chapters/${big[0]!.slug}`, { "accept-encoding": "gzip" })
  assert.equal(r.statusCode, 200)
  assert.equal(r.headers["content-encoding"], "gzip")
})

await t("validation 400 shape + unpublished hidden", async () => {
  const r = await get("/v1/books?limit=abc")
  assert.equal(r.statusCode, 400)
  const b = json(r)
  assert.equal(b.error, "Bad Request")
  assert.ok(Array.isArray(b.details))
  await prisma.book.updateMany({ where: { slug: bookSlug }, data: { published: false } })
  try {
    assert.equal((await get(`/v1/books/${bookSlug}`)).statusCode, 404)
    assert.equal(json(await get("/v1/books")).data.length, 0)
  } finally {
    await prisma.book.updateMany({ where: { slug: bookSlug }, data: { published: true } })
  }
})

await t("CORS restricted to WEB_ORIGIN", async () => {
  const r = await app.inject({ method: "GET", url: "/v1/health", headers: { origin: "http://localhost:3000" } })
  assert.equal(r.headers["access-control-allow-origin"], "http://localhost:3000")
})

console.log(`${n} tests passed`)
await app.close()
await prisma.$disconnect()
