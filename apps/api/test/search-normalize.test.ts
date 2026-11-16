import assert from "node:assert/strict"
import { test } from "node:test"
import { chaptersIndexBody, indexNames, passagesIndexBody } from "../src/search/index-definition.js"
import { detectLang, normalizeArabic, normalizeUrdu } from "../src/search/normalize.js"

test("diacritics, tatweel and the superscript alef are stripped", () => {
  assert.equal(normalizeUrdu("اللّٰہ"), "اللہ")
  assert.equal(normalizeArabic("اللَّه"), "الله")
  assert.equal(normalizeArabic("كِتَـابٌ"), "كتاب")
})

test("Allah variants and the ﷲ ligature agree within each script", () => {
  assert.equal(normalizeUrdu("اللہ"), normalizeUrdu("الله"))
  assert.equal(normalizeUrdu("ﷲ"), normalizeUrdu("اللہ"))
  assert.equal(normalizeArabic("اللہ"), normalizeArabic("الله"))
  assert.equal(normalizeArabic("ﷲ"), "الله")
})

test("honorific ligatures vanish so phrases match with or without them", () => {
  assert.equal(normalizeUrdu("حضور ﷺ نے").replace(/\s+/g, " "), "حضور نے")
  assert.equal(normalizeUrdu("ﷻ"), "")
})

test("letter variants fold to the script's canonical form", () => {
  assert.equal(normalizeUrdu("كتاب ي ة"), "کتاب ی ہ")
  assert.equal(normalizeUrdu("أحمد إبراهيم آدم"), "احمد ابراہیم ادم")
  assert.equal(normalizeArabic("کتاب ہے"), "كتاب ه" + "ي") // ے -> ي, ہ -> ه
  // Urdu keeps do-chashmi heh distinct from heh (کھا != کہا)
  assert.notEqual(normalizeUrdu("کھا"), normalizeUrdu("کہا"))
})

test("digits are unified to ASCII", () => {
  assert.equal(normalizeUrdu("مسئلہ ۲۶"), "مسئلہ 26")
  assert.equal(normalizeArabic("٢٦"), "26")
})

test("detectLang", () => {
  assert.equal(detectLang("Hello world"), "en")
  assert.equal(detectLang("ایک حوض ساڑھے سات گز"), "ur")
  assert.equal(detectLang("كتاب المياه"), "ar")
})

test("index definitions: contract names, analyzers, strict mappings", () => {
  assert.deepEqual(indexNames("sunniwiki"), { passages: "sunniwiki_passages", chapters: "sunniwiki_chapters" })
  for (const body of [passagesIndexBody, chaptersIndexBody]) {
    assert.deepEqual(Object.keys(body.settings.analysis.analyzer).sort(), ["ar_norm", "en_std", "ur_norm"])
    const p = body.mappings.properties as Record<string, { analyzer?: string }>
    assert.equal(p.text_ur?.analyzer, "ur_norm")
    assert.equal(p.text_ar?.analyzer, "ar_norm")
    assert.equal(p.text_en?.analyzer, "en_std")
  }
  const props = passagesIndexBody.mappings.properties
  for (const f of ["passageId", "parentId", "anchorId", "chunkOrder", "pageNo", "lang", "breadcrumb", "display", "bookId", "chapterId"])
    assert.ok(f in props, `passages.${f}`)
})
