import assert from "node:assert/strict"
import test from "node:test"
import {
  cleanQuery,
  fieldsFor,
  parseIds,
  scopeFilters,
  snippetMode,
  textQuery,
  toSnippets,
} from "../src/services/search-query.js"

test("cleanQuery trims, collapses whitespace and enforces caps", () => {
  assert.deepEqual(cleanQuery("  نماز \n  روزہ "), { text: "نماز روزہ", terms: 2 })
  assert.ok("error" in cleanQuery("   "))
  assert.ok("error" in cleanQuery("a".repeat(201)))
  assert.ok("error" in cleanQuery(Array.from({ length: 21 }, (_, i) => `w${i}`).join(" ")))
})

test("fieldsFor maps languages to fields", () => {
  assert.deepEqual(fieldsFor("ur"), ["text_ur"])
  assert.deepEqual(fieldsFor("all"), ["text_ur", "text_ar", "text_en"])
})

test("parseIds keeps valid unique ids only", () => {
  assert.deepEqual(parseIds("1,2,2,x,-3,4"), [1, 2, 4])
  assert.deepEqual(parseIds(undefined), [])
})

test("scopeFilters builds term filters", () => {
  assert.deepEqual(scopeFilters({}), [])
  assert.deepEqual(scopeFilters({ bookIds: [1, 2], chapterId: 5, categoryId: 3 }), [
    { terms: { bookId: [1, 2] } },
    { term: { chapterId: 5 } },
    { term: { categoryIds: 3 } },
  ])
})

test("textQuery builds per-field clauses per mode", () => {
  const all = textQuery("all", "نماز", ["text_ur"]) as any
  assert.equal(all.bool.should[0].match.text_ur.operator, "and")
  const any = textQuery("any", "نماز", ["text_ur", "text_ar"]) as any
  assert.equal(any.bool.should.length, 2)
  assert.equal(any.bool.should[1].match.text_ar.operator, "or")
  const ph = textQuery("phrase", "نماز جمعہ", ["text_ur"]) as any
  assert.equal(ph.bool.should[0].match_phrase.text_ur.query, "نماز جمعہ")
  assert.equal(snippetMode("all"), "any")
  assert.equal(snippetMode("phrase"), "phrase")
})

test("toSnippets picks the first highlighted field with its language", () => {
  const s = toSnippets(
    [
      { _source: { anchorId: "s-1" }, highlight: { text_ar: ["<mark>x</mark>"] } },
      { _source: {}, highlight: {} },
    ],
    ["text_ur", "text_ar"],
  )
  assert.deepEqual(s, [{ anchorId: "s-1", lang: "ar", html: "<mark>x</mark>", quote: { q: "x", e: null } }])
})

test("quoteAtHit: starts at the first mark, unescapes, extends backwards when short", async () => {
  const { quoteAtHit } = await import("../src/services/search-query.js")
  assert.equal(quoteAtHit(""), null)
  const r = quoteAtHit("قبل از اس &#x27;&#x27;<mark>نماز</mark> نہ پڑھنے&#x27;&#x27; کو جو کہ بیوی کے فعل کاعدم ہے")!
  assert.ok(r.q.startsWith("نماز نہ پڑھنے''"))
  assert.ok(r.q.length <= 60)
  const short = quoteAtHit("ایک لمبا جملہ جو نماز تک آتا ہے <mark>نماز</mark>")!
  assert.ok(short.q.includes("نماز") && short.q.length >= 25)
})
