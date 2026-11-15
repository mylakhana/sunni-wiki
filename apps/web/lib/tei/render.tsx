import { XMLParser } from "fast-xml-parser"
import { LazyParts } from "@/components/library/lazy-parts"
import type { ReactNode } from "react"

/**
 * TEI (fragment) -> React. Server-only in practice (parses up to ~2 MB of XML), but has no server APIs.
 * Never uses dangerouslySetInnerHTML: text goes through React's escaping and only whitelisted
 * attributes are read from the XML.
 */
type XNode = Record<string, unknown>
type Lang = "ar" | "ur" | "en" | undefined

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

function langOf(a: Record<string, string | undefined>): Lang {
  const v = (a["@_xml:lang"] ?? a["@_lang"])?.toLowerCase().slice(0, 2)
  return v === "ar" || v === "ur" || v === "en" ? v : undefined
}
const langClass = (l: Lang) => (l === "ar" ? "blk-ar" : l === "ur" ? "blk-ur" : "blk-p")
const fontClass = (l: Lang) => (l === "ar" ? "font-ar" : l === "ur" ? "font-ur" : "")
const dirOf = (l: Lang) => (l === "ar" || l === "ur" ? ("rtl" as const) : ("auto" as const))
const textOf = (nodes: XNode[]): string =>
  nodes.map((n) => ("#text" in n ? String(n["#text"]) : textOf(kids(n, tagOf(n) ?? "")))).join("")
/** Short Arabic formulae (basmala, hamdala/salawat, "الجواب") are set centered; longer Arabic prose stays start-aligned.
 *  Short Arabic quotes carrying a footnote marker (؂ U+0602, e.g. "…۳؂") sit mid-body and stay start-aligned too. */
const MAX_CENTERED_AR = 160
const centerArabicP = (c: XNode[]) => {
  const t = textOf(c).trim()
  return t.length <= MAX_CENTERED_AR && !t.includes("؂")
}
const isBlank = (n: XNode) => typeof n["#text"] === "string" && !(n["#text"] as string).trim()

/** Inline content: text, <hi>, <foreign>, <note> inside paragraphs, etc. */
function inline(nodes: XNode[]): ReactNode[] {
  return nodes.map((n, i) => block(n, i, true))
}

/** Block containers (div/ab/table) ignore whitespace-only text between children. */
function children(nodes: XNode[]): ReactNode[] {
  return nodes.filter((n) => !isBlank(n)).map((n, i) => block(n, i, false))
}

function block(n: XNode, key: number, isInline: boolean): ReactNode {
  if ("#text" in n) return String(n["#text"])
  const tag = tagOf(n)
  if (!tag) return null
  const a = attrs(n)
  const lang = langOf(a)
  const c = kids(n, tag)

  switch (tag) {
    case "div":
      return <section key={key} className="tei-div">{children(c)}</section>
    case "head":
      return (
        <h3 key={key} className={`blk-h tei-block ${lang ? fontClass(lang) : "font-ur"}${a["@_rend"] === "center" || c.some((x) => tagOf(x) === "lb") ? " text-center blk-h-title" : lang === "ar" ? " text-center" : ""}`} dir={lang === "en" ? "ltr" : "rtl"}>
          {inline(c)}
        </h3>
      )
    case "p":
      return <p key={key} className={`${langClass(lang)} tei-block${a["@_rend"] === "center" || (lang === "ar" && centerArabicP(c)) ? " text-center" : ""}`} dir={dirOf(lang)}>{inline(c)}</p>
    case "quote": {
      if (isInline) return <q key={key} lang={lang} className={fontClass(lang)}>{inline(c)}</q>
      if (a["@_type"] === "quran") {
        return (
          <figure key={key} className="blk-verse tei-block">
            <div className="kind">Qur’an</div>
            <p className={`${langClass(lang ?? "ar")} mb-0!`} dir="rtl">{inline(c)}</p>
          </figure>
        )
      }
      return (
        <blockquote key={key} className={`tei-quote tei-block ${langClass(lang)}`} dir={dirOf(lang)}>{inline(c)}</blockquote>
      )
    }
    case "note":
      if (isInline) {
        // inside a <p>: block elements are invalid HTML (hydration error), so keep it a span
        return <span key={key} className={`tei-note-inline ${fontClass(lang)}`} dir={dirOf(lang)}>{inline(c)}</span>
      }
      return (
        <aside key={key} className={`blk-note tei-note tei-block ${fontClass(lang)}`} dir={dirOf(lang)} data-note={a["@_type"]}>
          {inline(c)}
        </aside>
      )
    case "ab": {
      const t = a["@_type"]
      return (
        <div key={key} className={`tei-ab ${t === "question" || t === "answer" ? `tei-ab-${t}` : ""}`}>
          {(t === "question" || t === "answer") && <div className="kind">{t === "question" ? "Question" : "Answer"}</div>}
          {children(c)}
        </div>
      )
    }
    case "hi":
      return a["@_rend"] === "bold" ? <strong key={key}>{inline(c)}</strong> : a["@_rend"] === "italic" ? <em key={key}>{inline(c)}</em> : <span key={key}>{inline(c)}</span>
    case "foreign":
      return <span key={key} lang={lang} className={fontClass(lang)}>{inline(c)}</span>
    case "table":
      return (
        <div key={key} className="tei-table my-5 overflow-x-auto">
          <table className="blk-table"><tbody>{children(c)}</tbody></table>
        </div>
      )
    case "row":
      return <tr key={key}>{children(c)}</tr>
    case "cell":
      return <td key={key} className={fontClass(lang)} dir={dirOf(lang)}>{inline(c)}</td>
    case "figure": {
      const g = c.find((x) => tagOf(x) === "graphic")
      const url = g ? attrs(g)["@_url"] : undefined
      // Page images are not hosted yet: only absolute/site URLs are rendered, anything else is a placeholder.
      if (url && /^(https?:\/\/|\/)/.test(url)) {
        // eslint-disable-next-line @next/next/no-img-element
        return <figure key={key} className="tei-figure"><img src={url} alt="" loading="lazy" className="mx-auto max-w-full" /></figure>
      }
      return <figure key={key} className="tei-figure tei-figure-missing" role="img" aria-label="Illustration not available">Illustration not available</figure>
    }
    case "pb":
      if (isInline) return a["@_n"] ? <span key={key} className="tei-pb-inline">[p. {a["@_n"]}]</span> : null
      return a["@_n"] ? <div key={key} className="tei-pb" role="separator" aria-label={`Page ${a["@_n"]}`}><span>p. {a["@_n"]}</span></div> : null
    case "lb":
      return <br key={key} />
    case "anchor": {
      // Sub-topic jump target (xml:id "s-<IndexNo>"); zero-size, offset so it clears the sticky bars.
      const id = a["@_xml:id"]
      return id ? <span key={key} id={id} className="tei-anchor scroll-mt-40 block h-0" /> : null
    }
    case "index":
    case "graphic":
      return null
    default:
      // Unknown element: keep its text, drop the markup.
      return isInline ? <span key={key}>{inline(c)}</span> : <div key={key}>{children(c)}</div>
  }
}

/** Chapters above this size are served in parts (the biggest are ~1.8 MB of XML). */
const SPLIT_ABOVE = 250_000
const PART_BUDGET = 60_000

const CONTAINERS = new Set(["div", "ab"])
const textWeight = (n: XNode): number => {
  if ("#text" in n) return String(n["#text"]).length
  const t = tagOf(n)
  return t ? 40 + kids(n, t).reduce((a, c) => a + textWeight(c), 0) : 0
}

/** Total weight of all leaf blocks (containers div/ab are descended into, everything else is a leaf). */
function leafTotal(nodes: XNode[]): number {
  return nodes.reduce((sum, n) => {
    const t = tagOf(n)
    return sum + (t && CONTAINERS.has(t) ? leafTotal(kids(n, t)) : textWeight(n))
  }, 0)
}

/**
 * Keeps only the leaf blocks whose start offset lies in [from, to), preserving the div/ab wrappers around them,
 * so even a chapter that is one huge <ab> can be split.
 */
function window(nodes: XNode[], from: number, to: number, cursor: { pos: number }): XNode[] {
  const out: XNode[] = []
  for (const n of nodes) {
    const t = tagOf(n)
    if (t && CONTAINERS.has(t)) {
      const inner = window(kids(n, t), from, to, cursor)
      if (inner.length) out.push({ [t]: inner, ":@": n[":@"] })
    } else {
      const start = cursor.pos
      cursor.pos += textWeight(n)
      if (start >= from && start < to) out.push(n)
    }
  }
  return out
}

/** True when a chapter is large enough to be served in parts. */
export const isLongTei = (tei: string) => tei.length > SPLIT_ABOVE

function anchorOffset(nodes: XNode[], id: string, cursor: { pos: number }): number | null {
  for (const n of nodes) {
    const t = tagOf(n)
    if (t && CONTAINERS.has(t)) {
      const r = anchorOffset(kids(n, t), id, cursor)
      if (r != null) return r
    } else {
      if (t === "anchor" && attrs(n)["@_xml:id"] === id) return cursor.pos
      cursor.pos += textWeight(n)
    }
  }
  return null
}

/** 1-based part of a (possibly split) chapter that contains the anchor `id`; 1 when short or not found. */
export function partOfAnchor(tei: string, id: string): number {
  if (!isLongTei(tei)) return 1
  try {
    const tree = (parser.parse(tei) as XNode[]).filter((n) => tagOf(n) !== "?xml")
    const pos = anchorOffset(tree, id, { pos: 0 })
    return pos == null ? 1 : Math.floor(pos / PART_BUDGET) + 1
  } catch {
    return 1
  }
}

const plain = (nodes: XNode[]): string =>
  nodes.map((n) => ("#text" in n ? String(n["#text"]) : (() => { const t = tagOf(n); return t ? plain(kids(n, t)) : "" })())).join("")
const norm = (s: string) => s.replace(/\s+/g, " ").trim()

/**
 * Removes the leading <head> when it merely repeats the chapter title (already shown in the page header).
 * Only the first meaningful node (descending through leading div/ab wrappers) is considered.
 */
function dropTitleHead(nodes: XNode[], titles: string[]): XNode[] {
  const wanted = new Set(titles.map(norm).filter(Boolean))
  if (!wanted.size) return nodes
  const walk = (list: XNode[]): XNode[] => {
    const i = list.findIndex((n) => !isBlank(n) && tagOf(n) !== "anchor" && tagOf(n) !== "pb")
    if (i < 0) return list
    const n = list[i]!
    const t = tagOf(n)
    if (t === "head") return wanted.has(norm(plain(kids(n, t)))) ? list.filter((_, j) => j !== i) : list
    if (t && CONTAINERS.has(t)) {
      const inner = walk(kids(n, t))
      return inner === kids(n, t) ? list : list.map((x, j) => (j === i ? { ...n, [t]: inner } : x))
    }
    return list
  }
  return walk(nodes)
}

function parseTei(tei: string): XNode[] | null {
  try {
    return (parser.parse(tei) as XNode[]).filter((n) => tagOf(n) !== "?xml")
  } catch {
    return null
  }
}

/**
 * Renders one part (1-based) of a chapter. Short chapters are a single part. Long chapters are cut by size
 * (never shown to the reader): part 1 is rendered with the page, the next ones are requested as the reader reaches the end.
 * Returns the number of parts too, so the caller knows whether more follow.
 */
export function renderTeiPart(tei: string, part = 1, titles: string[] = []): { node: ReactNode; parts: number } {
  const parsed = parseTei(tei)
  const tree = parsed && titles.length ? dropTitleHead(parsed, titles) : parsed
  if (!tree) return { node: <p className="blk-note">This chapter&rsquo;s text could not be displayed.</p>, parts: 1 }
  if (!isLongTei(tei)) return { node: children(tree), parts: 1 }
  const parts = Math.max(1, Math.ceil(leafTotal(tree) / PART_BUDGET))
  const n = Math.min(Math.max(1, part), parts)
  return { node: children(window(tree, (n - 1) * PART_BUDGET, n * PART_BUDGET, { pos: 0 })), parts }
}

/** Renders the chapter text from `part` on; the following parts of a long chapter are appended on demand by <LazyParts>. */
export function TeiContent({ tei, part = 1, book, chapter, titles = [] }: { tei: string; part?: number; book: string; chapter: string; titles?: string[] }) {
  const { node, parts } = renderTeiPart(tei, part, titles)
  const first = Math.min(Math.max(1, part), parts)
  return (
    <div className="tei-root">
      {node}
      {first < parts && <LazyParts key={`${chapter}:${first}`} book={book} chapter={chapter} next={first + 1} />}
    </div>
  )
}
