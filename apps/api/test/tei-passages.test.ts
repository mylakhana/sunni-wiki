import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { teiToPassages } from "../src/services/tei-passages.service.js"

const fx = (id: number) => readFileSync(new URL(`./fixtures/content-${id}.xml`, import.meta.url), "utf8")

test("fatwa: heading + question share a passage, answer is its own passage, same parent (real sample 46846)", () => {
  const ps = teiToPassages(fx(46846))
  assert.equal(ps.length, 2)
  assert.deepEqual(ps.map((p) => p.role), ["question", "answer"])
  assert.ok(ps.every((p) => p.parentSeq === 0))
  assert.deepEqual(ps.map((p) => p.chunkOrder), [0, 1])
  assert.match(ps[0]!.text_ur, /^فتوٰی ۔ ساڑھے سات گز مربع حوض/)
  assert.match(ps[0]!.text_ur, /ایک حوض ساڑھے سات گز لمبا/)
  assert.match(ps[1]!.text_ur, /^الجواب پاک رہا/)
  assert.equal(ps[0]!.pageNo, "39-41") // <pb> is metadata only
  assert.equal(ps[0]!.heading, "فتوٰی ۔ ساڑھے سات گز مربع حوض پیشاب سے ناپاک نہ ہوگا۔")
  assert.equal(ps[0]!.lang, "ur")
})

test("anchors always start a passage and become anchorId (real sample 46936)", () => {
  const ps = teiToPassages(fx(46936))
  const q = ps.find((p) => p.role === "question")!
  assert.equal(q.anchorId, "s-1.001.014")
  assert.match(q.text_ur, /^مسئلہ ۶۰/)
})

test("Arabic spans go to text_ar, Urdu prose stays in text_ur (real sample 46886)", () => {
  const ps = teiToPassages(fx(46886))
  assert.ok(ps.length > 0)
  assert.ok(ps.some((p) => p.text_ar.length > 0))
  assert.ok(ps.every((p) => !/<\/?[a-z]+/i.test(p.display)))
  assert.deepEqual(ps.map((p) => p.seq), ps.map((_, i) => i))
})

test("footnote text stays searchable and is attached to its paragraph (real sample 46907)", () => {
  const ps = teiToPassages(fx(46907))
  assert.ok(ps.some((p) => p.text_ur.includes("اگرچہ")))
})

test("synthetic: new fatwa div = new parent; small paragraphs merge; figures dropped; whitespace normalised", () => {
  const ps = teiToPassages(
    `<div><div><head>One</head><ab type="question"><p xml:lang="ur">سوال</p><p xml:lang="ur">مزید</p></ab>` +
      `<ab type="answer"><p xml:lang="ur">جواب   یہ\n ہے</p><figure><graphic url="x.png"/></figure></ab></div>` +
      `<div><head>Two</head><ab type="question"><p xml:lang="ur">دوسرا</p></ab></div></div>`,
  )
  assert.equal(ps.length, 3)
  assert.equal(ps[0]!.text_ur, "سوال مزید") // 2 question paragraphs merged into the heading's passage
  assert.equal(ps[0]!.text_en, "One")
  assert.equal(ps[1]!.text_ur, "جواب یہ ہے")
  assert.equal(ps[1]!.parentSeq, 0)
  assert.equal(ps[2]!.parentSeq, 2)
  assert.equal(ps[2]!.chunkOrder, 0)
})

test("synthetic: foreign xml:lang splits languages inside one paragraph; unlabeled Latin is English", () => {
  const [p] = teiToPassages(
    `<div><p xml:lang="ur">قال تعالٰی <foreign xml:lang="ar">وَالصَّلاةُ</foreign> اور <hi>Hello world</hi></p></div>`,
  )
  assert.equal(p!.text_ar, "وَالصَّلاةُ")
  assert.match(p!.text_ur, /^قال تعالٰی اور/)
  assert.match(p!.text_en + p!.text_ur, /Hello world/)
})

test("synthetic: long paragraph is split on sentence boundaries into passages <= target; first keeps the anchor", () => {
  const sentence = "یہ ایک جملہ ہے جو کافی لمبا ہے تاکہ تقسیم ہو۔ "
  const big = sentence.repeat(120)
  const ps = teiToPassages(`<div><anchor xml:id="s-9"/><p xml:lang="ur">${big}</p></div>`, { target: 500 })
  assert.ok(ps.length > 3)
  assert.equal(ps[0]!.anchorId, "s-9")
  assert.ok(ps.slice(1).every((p) => !p.anchorId))
  assert.ok(ps.every((p) => p.text_ur.length <= 600))
  assert.ok(ps.every((p) => p.parentSeq === 0))
  // nothing lost
  assert.equal(ps.map((p) => p.text_ur).join(" ").replace(/\s+/g, ""), big.replace(/\s+/g, ""))
})

test("empty / markup-only TEI gives no passages", () => {
  assert.deepEqual(teiToPassages(`<div><figure><graphic url="a.png"/></figure><pb n="3"/></div>`), [])
})
