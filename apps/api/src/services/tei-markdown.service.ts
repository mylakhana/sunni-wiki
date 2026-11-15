import { XMLParser } from "fast-xml-parser"

/**
 * TEI fragment -> compact Markdown. Pure (no I/O). Arabic/Urdu text is kept verbatim.
 * Format spec: apps/api/docs/api-structure.md ("Markdown format").
 *
 * - <head> -> `#`..`######` by nesting depth (chapter title itself is not repeated), `{#s-…}` anchors kept
 * - <ab type=question|answer> -> first paragraph prefixed `Q: ` / `A: `
 * - <quote> -> `> ` blockquote (inline quote -> “…”)
 * - <note> -> `[^n]` reference + `[^n]: text` definitions at the end
 * - <pb n="N"> -> `[p. N]`
 * - <anchor xml:id> -> `{#id}` in front of the next paragraph (or after the next heading)
 * - hi / foreign / unknown inline wrappers flattened; figure / graphic / index dropped
 */
type XNode = Record<string, unknown>

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

const CONTAINERS = new Set(["div", "ab", "body", "text", "lg", "cit", "list"])
const DROPPED = new Set(["figure", "graphic", "index", "milestone", "?xml"])

type Ctx = { notes: string[]; anchors: string[]; label: string }

function inline(nodes: XNode[], ctx: Ctx): string {
  let s = ""
  for (const n of nodes) {
    if (isText(n)) {
      s += String(n["#text"])
      continue
    }
    const tag = tagOf(n)
    if (!tag || DROPPED.has(tag)) continue
    const a = attrs(n)
    const c = kids(n, tag)
    switch (tag) {
      case "lb":
        s += " "
        break
      case "pb":
        if (a["@_n"]) s += ` [p. ${a["@_n"]}] `
        break
      case "anchor":
        if (a["@_xml:id"]) ctx.anchors.push(a["@_xml:id"])
        break
      case "note":
        s += noteRef(c, ctx)
        break
      case "quote":
      case "q":
        s += ` “${norm(inline(c, ctx))}” `
        break
      default:
        s += inline(c, ctx) // hi, foreign, unknown: flatten
    }
  }
  return s
}

function noteRef(c: XNode[], ctx: Ctx): string {
  const text = norm(inline(c, ctx))
  if (!text) return ""
  ctx.notes.push(text)
  return `[^${ctx.notes.length}]`
}

/** Pending `Q: ` / `A: ` label and `{#id}` anchors go in front of the next text block. */
function prefix(ctx: Ctx): string {
  const parts = [ctx.label.trim(), ...ctx.anchors.map((id) => `{#${id}}`)].filter(Boolean)
  ctx.label = ""
  ctx.anchors = []
  return parts.length ? `${parts.join(" ")} ` : ""
}

function textBlock(c: XNode[], ctx: Ctx, out: string[], quote = false) {
  const text = norm(inline(c, ctx))
  if (!text) return
  const p = prefix(ctx)
  out.push(quote ? `> ${p}${text}` : `${p}${text}`)
}

function blocks(nodes: XNode[], ctx: Ctx, out: string[], depth: number) {
  for (const n of nodes) {
    if (isText(n)) {
      textBlock([n], ctx, out)
      continue
    }
    const tag = tagOf(n)
    if (!tag || DROPPED.has(tag)) continue
    const a = attrs(n)
    const c = kids(n, tag)
    switch (tag) {
      case "div":
        blocks(c, ctx, out, depth + 1)
        break
      case "ab": {
        const t = a["@_type"]
        if (t === "question") ctx.label = "Q: "
        else if (t === "answer") ctx.label = "A: "
        blocks(c, ctx, out, depth)
        ctx.label = ""
        break
      }
      case "head": {
        const text = norm(inline(c, ctx))
        if (!text) break
        const level = Math.min(6, Math.max(2, depth + 1))
        const ids = ctx.anchors.map((id) => ` {#${id}}`).join("")
        ctx.anchors = []
        out.push(`${"#".repeat(level)} ${text}${ids}`)
        break
      }
      case "quote":
        textBlock(c, ctx, out, true)
        break
      case "note": {
        const ref = noteRef(c, ctx)
        if (!ref) break
        if (out.length) out[out.length - 1] += ref
        else out.push(ref)
        break
      }
      case "pb":
        if (a["@_n"]) out.push(`[p. ${a["@_n"]}]`)
        break
      case "anchor":
        if (a["@_xml:id"]) ctx.anchors.push(a["@_xml:id"])
        break
      case "table": {
        const rows: string[] = []
        for (const r of c) {
          if (tagOf(r) !== "row") continue
          const cells = kids(r, "row")
            .filter((x) => tagOf(x) === "cell")
            .map((x) => norm(inline(kids(x, "cell"), ctx)).replace(/\|/g, "\\|"))
          if (!cells.length) continue
          rows.push(`| ${cells.join(" | ")} |`)
          if (rows.length === 1) rows.push(`|${cells.map(() => " --- |").join("")}`)
        }
        if (rows.length) out.push(rows.join("\n"))
        break
      }
      default:
        if (CONTAINERS.has(tag)) blocks(c, ctx, out, depth)
        else textBlock([n], ctx, out) // p, l, item, unknown: one paragraph, markup flattened
    }
  }
}

export function teiToMarkdown(tei: string): string {
  const tree = (parser.parse(tei) as XNode[]).filter((n) => tagOf(n) !== "?xml")
  const ctx: Ctx = { notes: [], anchors: [], label: "" }
  const out: string[] = []
  blocks(tree, ctx, out, 0)
  if (ctx.anchors.length) out.push(ctx.anchors.map((id) => `{#${id}}`).join(" "))
  let md = out.join("\n\n")
  if (ctx.notes.length) md += `\n\n${ctx.notes.map((t, i) => `[^${i + 1}]: ${t}`).join("\n")}`
  return md
}

/** Estimated tokens for a Markdown length (heuristic used everywhere: ceil(chars / 3)). */
export const estimateTokens = (chars: number) => Math.ceil(chars / 3)
