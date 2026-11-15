import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { teiToMarkdown } from "../src/services/tei-markdown.service.js"

const fx = (id: number) => readFileSync(new URL(`./fixtures/content-${id}.xml`, import.meta.url), "utf8")

test("question/answer labels, page break and Urdu kept verbatim (real sample 46846)", () => {
  const md = teiToMarkdown(fx(46846))
  assert.match(md, /^## فتوٰی ۔ ساڑھے سات گز مربع حوض/)
  assert.match(md, /\[p\. 39-41\]/)
  assert.match(md, /^Q: مسئلہ ۲۶ : ۱۱ صفر ۱۳۰۹ھ$/m)
  assert.match(md, /^A: الجواب$/m)
  assert.match(md, /ایک حوض ساڑھے سات گز لمبا/)
  assert.ok(!md.includes("<"))
})

test("anchors are kept as {#id} before the next paragraph (real sample 46936)", () => {
  const md = teiToMarkdown(fx(46936))
  assert.match(md, /^Q: \{#s-1\.001\.014\} \{#s-1\.001\.015\} \{#s-1\.001\.016\} مسئلہ ۶۰/m)
})

test("footnotes become [^n] with definitions at the end (real sample 46907, 46936)", () => {
  const a = teiToMarkdown(fx(46907))
  assert.match(a, /\[\^1\]/)
  assert.match(a, /\n\n\[\^1\]: \(عہ۱\)اگرچہ/)
  const b = teiToMarkdown(fx(46936))
  assert.match(b, /واللّٰہ تعالٰی اعلم۔\[\^1\]/)
  assert.match(b, /\[\^1\]: \(۱؎ فتاوٰی ہندیۃ/)
})

test("whole Qur'an sample converts to non-empty text without markup (46886)", () => {
  const md = teiToMarkdown(fx(46886))
  assert.ok(md.length > 100)
  assert.ok(!/<\/?[a-z]+/i.test(md))
})

test("synthetic: headings by depth, anchors on headings, quotes, tables, noise dropped, whitespace normalised", () => {
  const md = teiToMarkdown(
    `<div><head>Top</head><div><anchor xml:id="s-1"/><head>Sub\n   title</head>` +
      `<p>a  <hi rend="bold">bold</hi>\n<foreign xml:lang="ar">عربي</foreign> <q>in</q></p>` +
      `<quote>Quoted   text</quote><figure><graphic url="x.png"/></figure><index/>` +
      `<table><row><cell>h1</cell><cell>h2</cell></row><row><cell>a</cell><cell>b|c</cell></row></table>` +
      `<pb n="7"/><p>after</p></div></div>`,
  )
  assert.equal(
    md,
    ["## Top", "### Sub title {#s-1}", "a bold عربي “in”", "> Quoted text", "| h1 | h2 |\n| --- | --- |\n| a | b\\|c |", "[p. 7]", "after"].join("\n\n"),
  )
})

test("synthetic: empty and whitespace-only input", () => {
  assert.equal(teiToMarkdown(""), "")
  assert.equal(teiToMarkdown("<div> \n </div>"), "")
})

// Largest chapter (~1.8 MB TEI) straight from the DB; skipped when it is unreachable.
test("largest real chapter converts quickly and shrinks", async (t) => {
  let tei: string | undefined
  try {
    const { prisma } = await import("../src/config/prisma.js")
    const rows = await prisma.$queryRaw<{ tei: string }[]>`select tei from content order by length(tei) desc limit 1`
    tei = rows[0]?.tei
    await prisma.$disconnect()
  } catch {
    return t.skip("database not reachable")
  }
  if (!tei) return t.skip("no content")
  const t0 = performance.now()
  const md = teiToMarkdown(tei)
  const ms = performance.now() - t0
  console.log(`  largest: tei=${tei.length} md=${md.length} in ${Math.round(ms)} ms`)
  assert.ok(tei.length > 1_000_000)
  assert.ok(md.length > 0 && md.length < tei.length)
  assert.ok(ms < 2000, `took ${ms} ms`)
})
