import { XMLParser } from "fast-xml-parser"
import { detectLang, type Lang } from "../search/normalize.js"

/**
 * TEI fragment -> ordered search passages. Pure (no I/O). Same TEI conventions as tei-markdown.service.ts
 * (which is intentionally left untouched); this file only *reads* the structure to cut it into units.
 *
 * Rules (also in apps/api/docs/search-index.md):
 *  - Parent unit: every <div> that directly contains <ab type="question|answer"> starts a new parent
 *    (a fatwa: heading + question + answer stay under one parent). Other text belongs to the chapter's root parent.
 *  - Question / answer / body text are never merged into the same passage; small blocks of the same role are merged
 *    up to `target` chars, blocks over `splitAbove` chars are split on sentence boundaries.
 *  - Headings start a new passage (and absorb the paragraphs that follow them).
 *  - An <anchor xml:id> always starts a new passage so reader jump-targets are never swallowed by a merge.
 *  - Text is split per language: Arabic quotes inside Urdu prose go to `text_ar` (own analyzer), not into `text_ur`.
 *  - <pb n> is only metadata (`pageNo`), never a boundary. Footnotes are appended to the paragraph they belong to.
 *  - figure / graphic / index / milestone are dropped.
 */
export type PassageRole = "question" | "answer" | "body"

export type TeiPassage = {
  /** 0-based order within the TEI fragment. */
  seq: number
  /** seq of the first passage of this passage's parent unit (== seq for the first one). */
  parentSeq: number
  /** 0-based order within the parent unit. */
  chunkOrder: number
  anchorId?: string
  pageNo?: string
  role: PassageRole
  /** Dominant language (most characters). */
  lang: Lang
  /** Nearest heading at or before the passage. */
  heading?: string
  text_ur: string
  text_ar: string
  text_en: string
  /** Original text, all languages, in reading order. */
  display: string
}

export type PassageOptions = {
  /** Merge small blocks up to this many characters (~400 tokens at chars/3). */
  target?: number
  /** Blocks longer than this are split on sentence boundaries into pieces of at most `target`. */
  splitAbove?: number
}

type XNode = Record<string, unknown>
type Seg = { lang: Lang; text: string }
type Block = {
  segs: Seg[]
  group: number
  role: PassageRole
  isHead: boolean
  anchors: string[]
  page?: string
  heading?: string
}

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
})

const attrs = (n: XNode) => (n[":@"] ?? {}) as Record<string, string | undefined>
const tagOf = (n: XNode) => Object.keys(n).find((k) => k !== ":@")
const kids = (n: XNode, tag: string) => (Array.isArray(n[tag]) ? (n[tag] as XNode[]) : [])
const isText = (n: XNode) => "#text" in n
const norm = (s: string) => s.replace(/\s+/g, " ").trim()
const DROPPED = new Set(["figure", "graphic", "index", "milestone", "?xml"])
const LANGS = new Set(["ur", "ar", "en"])

const asLang = (v: string | undefined): Lang | undefined => {
  const l = v?.toLowerCase().split("-")[0]
  return l && LANGS.has(l) ? (l as Lang) : undefined
}

type State = {
  lang?: Lang
  role: PassageRole
  group: number
  page?: string
  heading?: string
  anchors: string[]
  nextGroup: number
}

function pushSeg(segs: Seg[], lang: Lang | undefined, text: string) {
  if (!text) return
  const l = lang ?? detectLang(text)
  const last = segs[segs.length - 1]
  if (last && last.lang === l) last.text += text
  else segs.push({ lang: l, text })
}

/** Inline content -> language-tagged segments; footnote texts are collected into `notes`. */
function inline(nodes: XNode[], lang: Lang | undefined, st: State, segs: Seg[], notes: Seg[][]) {
  for (const n of nodes) {
    if (isText(n)) {
      pushSeg(segs, lang, String(n["#text"]))
      continue
    }
    const tag = tagOf(n)
    if (!tag || DROPPED.has(tag)) continue
    const a = attrs(n)
    const c = kids(n, tag)
    const l = asLang(a["@_xml:lang"]) ?? lang
    switch (tag) {
      case "lb":
        pushSeg(segs, lang, " ")
        break
      case "pb":
        if (a["@_n"]) st.page = a["@_n"]
        break
      case "anchor":
        if (a["@_xml:id"]) st.anchors.push(a["@_xml:id"])
        break
      case "note": {
        const ns: Seg[] = []
        inline(c, l, st, ns, [])
        if (ns.some((s) => norm(s.text))) notes.push(ns)
        break
      }
      case "quote":
      case "q":
        pushSeg(segs, lang, " ")
        inline(c, l, st, segs, notes)
        pushSeg(segs, lang, " ")
        break
      default:
        inline(c, l, st, segs, notes) // hi, foreign, unknown: flatten (xml:lang honoured)
    }
  }
}

function cleanSegs(segs: Seg[]): Seg[] {
  const out: Seg[] = []
  for (const s of segs) {
    const t = norm(s.text)
    if (!t) continue
    const last = out[out.length - 1]
    if (last && last.lang === s.lang) last.text += ` ${t}`
    else out.push({ lang: s.lang, text: t })
  }
  return out
}

function makeBlock(nodes: XNode[], lang: Lang | undefined, st: State, out: Block[], isHead = false) {
  const page = st.page // page in force where the block starts
  const startAnchors = st.anchors
  st.anchors = []
  const segs: Seg[] = []
  const notes: Seg[][] = []
  inline(nodes, lang, st, segs, notes)
  for (const ns of notes) segs.push(...ns)
  const clean = cleanSegs(segs)
  if (!clean.length) {
    st.anchors = [...startAnchors, ...st.anchors] // keep anchors for the next real block
    return
  }
  // anchors placed inside the block (inline) travel with it
  const anchors = [...startAnchors, ...st.anchors]
  st.anchors = []
  if (isHead) st.heading = clean.map((s) => s.text).join(" ")
  out.push({ segs: clean, group: st.group, role: st.role, isHead, anchors, page, heading: st.heading })
}

function walk(nodes: XNode[], lang: Lang | undefined, st: State, out: Block[]) {
  for (const n of nodes) {
    if (isText(n)) {
      if (norm(String(n["#text"]))) makeBlock([n], lang, st, out)
      continue
    }
    const tag = tagOf(n)
    if (!tag || DROPPED.has(tag)) continue
    const a = attrs(n)
    const c = kids(n, tag)
    const l = asLang(a["@_xml:lang"]) ?? lang
    switch (tag) {
      case "div": {
        const saved = { group: st.group, role: st.role }
        if (c.some((k) => tagOf(k) === "ab" && /^(question|answer)$/.test(attrs(k)["@_type"] ?? ""))) st.group = st.nextGroup++
        walk(c, l, st, out)
        st.group = saved.group
        st.role = saved.role
        break
      }
      case "body":
      case "text":
      case "lg":
      case "cit":
      case "list":
        walk(c, l, st, out)
        break
      case "ab": {
        const t = a["@_type"]
        const saved = st.role
        st.role = t === "question" ? "question" : t === "answer" ? "answer" : st.role
        walk(c, l, st, out)
        st.role = saved
        break
      }
      case "head":
        makeBlock(c, l, st, out, true)
        break
      case "pb":
        if (a["@_n"]) st.page = a["@_n"]
        break
      case "anchor":
        if (a["@_xml:id"]) st.anchors.push(a["@_xml:id"])
        break
      case "note": {
        // block-level footnote: belongs to the previous block
        const tmp: Block[] = []
        makeBlock(c, l, st, tmp)
        const prev = out[out.length - 1]
        if (prev && tmp[0]) prev.segs = cleanSegs([...prev.segs, ...tmp[0].segs])
        else out.push(...tmp)
        break
      }
      case "table": {
        for (const r of c) {
          if (tagOf(r) !== "row") continue
          const cells = kids(r, "row").filter((x) => tagOf(x) === "cell")
          const row: XNode[] = []
          cells.forEach((x, i) => {
            if (i) row.push({ "#text": " | " })
            row.push(...kids(x, "cell"))
          })
          makeBlock(row, l, st, out)
        }
        break
      }
      default:
        makeBlock([n], lang, st, out) // p, quote, l, item, unknown: one block, markup flattened
    }
  }
}

const SENTENCE_END = /(?<=[۔.!؟?؛\n])\s+/u

/** Split a long block into pieces <= target (sentence boundaries, hard split at whitespace as a last resort). */
function splitBlock(b: Block, target: number): Block[] {
  const units: Seg[] = []
  for (const s of b.segs) {
    for (const sent of s.text.split(SENTENCE_END)) {
      let rest = sent
      while (rest.length > target) {
        let cut = rest.lastIndexOf(" ", target)
        if (cut < target / 2) cut = target
        units.push({ lang: s.lang, text: rest.slice(0, cut).trim() })
        rest = rest.slice(cut).trim()
      }
      if (rest) units.push({ lang: s.lang, text: rest })
    }
  }
  const pieces: Block[] = []
  let cur: Seg[] = []
  let len = 0
  const flush = () => {
    if (!cur.length) return
    pieces.push({ ...b, segs: cleanSegs(cur), isHead: b.isHead && !pieces.length, anchors: pieces.length ? [] : b.anchors })
    cur = []
    len = 0
  }
  for (const u of units) {
    if (len && len + u.text.length + 1 > target) flush()
    cur.push({ lang: u.lang, text: u.text + " " })
    len += u.text.length + 1
  }
  flush()
  return pieces
}

const blockLen = (b: Block) => b.segs.reduce((n, s) => n + s.text.length + 1, 0)

type Acc = Block & { len: number; onlyHead: boolean }

export function teiToPassages(tei: string, opts: PassageOptions = {}): TeiPassage[] {
  const target = opts.target ?? 1200
  const splitAbove = opts.splitAbove ?? Math.round(target * 1.5)
  const tree = (parser.parse(tei) as XNode[]).filter((n) => tagOf(n) !== "?xml")
  const st: State = { role: "body", group: 0, anchors: [], nextGroup: 1 }
  const raw: Block[] = []
  walk(tree, undefined, st, raw)

  const blocks = raw.flatMap((b) => (blockLen(b) > splitAbove ? splitBlock(b, target) : [b]))

  // merge
  const merged: Acc[] = []
  let acc: Acc | null = null
  const flush = () => {
    if (acc) merged.push(acc)
    acc = null
  }
  for (const b of blocks) {
    const len = blockLen(b)
    if (acc) {
      // a lone heading absorbs the first paragraph after it whatever its role (e.g. title + question)
      const sameRole = acc.role === b.role || acc.onlyHead
      const mergeable = !b.isHead && !b.anchors.length && acc.group === b.group && sameRole && acc.len + len <= target
      if (mergeable) {
        acc.segs = [...acc.segs, ...b.segs]
        acc.len += len
        acc.page ??= b.page
        if (acc.onlyHead) acc.role = b.role
        acc.onlyHead = false
        continue
      }
      flush()
    }
    acc = { ...b, segs: [...b.segs], len, onlyHead: b.isHead }
  }
  flush()

  // finalize
  const firstOfGroup = new Map<number, number>()
  const chunkIdx = new Map<number, number>()
  const out: TeiPassage[] = []
  merged.forEach((m, seq) => {
    if (!firstOfGroup.has(m.group)) firstOfGroup.set(m.group, seq)
    const chunkOrder = chunkIdx.get(m.group) ?? 0
    chunkIdx.set(m.group, chunkOrder + 1)
    const by: Record<Lang, string[]> = { ur: [], ar: [], en: [] }
    for (const s of m.segs) by[s.lang].push(s.text)
    const chars: Record<Lang, number> = { ur: 0, ar: 0, en: 0 }
    for (const l of ["ur", "ar", "en"] as Lang[]) chars[l] = by[l].join(" ").length
    const lang = (["ur", "ar", "en"] as Lang[]).reduce((best, l) => (chars[l] > chars[best] ? l : best), "ur" as Lang)
    out.push({
      seq,
      parentSeq: firstOfGroup.get(m.group)!,
      chunkOrder,
      ...(m.anchors[0] ? { anchorId: m.anchors[0] } : {}),
      ...(m.page ? { pageNo: m.page } : {}),
      role: m.role,
      lang,
      ...(m.heading ? { heading: m.heading } : {}),
      text_ur: by.ur.join(" "),
      text_ar: by.ar.join(" "),
      text_en: by.en.join(" "),
      display: m.segs.map((s) => s.text).join(" "),
    })
  })
  return out
}
