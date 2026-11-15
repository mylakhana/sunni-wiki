import { memo, useMemo, type ReactNode } from "react"

/** Small, safe renderer for the compact Markdown the API produces (no dangerouslySetInnerHTML, React escapes all text). */
type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "q"; text: string }
  | { t: "fn"; n: string; text: string }

const ANCHOR = /\{#([^}\s]+)\}/g
const URDU_ONLY = /[ٹڈڑںےگچپژکھ]/
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g

function parse(md: string): Block[] {
  const out: Block[] = []
  for (const raw of md.split(/\n{2,}/)) {
    const para = raw.trim()
    if (!para) continue
    const h = /^(#{1,6})\s+([\s\S]*)$/.exec(para)
    if (h) { out.push({ t: "h", level: h[1]!.length, text: h[2]! }); continue }
    const fn = /^\[\^(\d+)\]:\s*([\s\S]*)$/.exec(para)
    if (fn) { out.push({ t: "fn", n: fn[1]!, text: fn[2]! }); continue }
    const lines = para.split("\n")
    if (lines.every((l) => l.startsWith(">"))) { out.push({ t: "q", text: lines.map((l) => l.replace(/^>\s?/, "")).join("\n") }); continue }
    // footnote definitions may be separated by single newlines
    if (lines.every((l) => /^\[\^\d+\]:/.test(l))) { for (const l of lines) { const m = /^\[\^(\d+)\]:\s*(.*)$/.exec(l)!; out.push({ t: "fn", n: m[1]!, text: m[2]! }) } continue }
    out.push({ t: "p", text: para })
  }
  return out
}

/** Anchors `{#id}` leave the display text but survive as element ids. */
function splitAnchors(text: string) {
  const ids = [...text.matchAll(ANCHOR)].map((m) => m[1]!)
  return { ids, text: text.replace(ANCHOR, "").replace(/[ \t]{2,}/g, " ").trim() }
}

function script(text: string): "ur" | "ar" | null {
  const ar = text.match(ARABIC)?.length ?? 0
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0
  if (ar === 0 || ar < latin) return null
  return URDU_ONLY.test(text) ? "ur" : "ar"
}

function inline(text: string, prefix: string): ReactNode[] {
  return text.split(/(\[\^\d+\]|\[p\.\s*[^\]]+\])/).map((part, i) => {
    const fn = /^\[\^(\d+)\]$/.exec(part)
    if (fn) return <sup key={i}><a href={`#${prefix}-fn-${fn[1]}`} className="c-accent" dir="ltr">{fn[1]}</a></sup>
    if (/^\[p\./.test(part)) return <span key={i} className="c-muted num rounded px-1 text-[0.7em] font-medium" dir="ltr" style={{ background: "var(--lib-line)" }}>{part.slice(1, -1)}</span>
    const qa = i === 0 ? /^(Q|A):\s/.exec(part) : null
    if (qa) return <span key={i}><strong className="c-gold" dir="ltr">{qa[1]}:</strong> {part.slice(qa[0].length)}</span>
    return part
  })
}

const Anchors = ({ ids }: { ids: string[] }) => <>{ids.slice(1).map((id) => <span key={id} id={id} />)}</>

function Body({ md, prefix }: { md: string; prefix: string }) {
  const blocks = useMemo(() => parse(md), [md])
  const notes = blocks.filter((b): b is Extract<Block, { t: "fn" }> => b.t === "fn")
  return (
    <>
      {blocks.map((b, i) => {
        if (b.t === "fn") return null
        const { ids, text } = splitAnchors(b.text)
        const id = ids[0]
        const sc = script(text)
        const cls = sc === "ur" ? "blk-ur" : sc === "ar" ? "blk-ar" : "blk-p"
        if (b.t === "h") {
          const Tag = (b.level <= 2 ? "h3" : b.level === 3 ? "h4" : "h5") as "h3"
          return <Tag key={i} id={id} dir="auto" className={`${b.level <= 2 ? "blk-h" : "blk-sh"} ${sc === "ur" ? "font-ur" : sc === "ar" ? "font-ar" : ""}`}><Anchors ids={ids} />{inline(text, prefix)}</Tag>
        }
        if (b.t === "q") return <blockquote key={i} id={id} dir="auto" className={`blk-note tei-block whitespace-pre-line ${sc === "ur" ? "font-ur" : sc === "ar" ? "font-ar" : ""}`}><Anchors ids={ids} />{inline(text, prefix)}</blockquote>
        return <p key={i} id={id} dir="auto" className={`${cls} tei-block`}><Anchors ids={ids} />{inline(text, prefix)}</p>
      })}
      {notes.length > 0 && (
        <ol className="bd-line mt-6 space-y-1 border-t pt-3 text-sm" aria-label="Footnotes">
          {notes.map((n) => {
            const sc = script(n.text)
            return <li key={n.n} id={`${prefix}-fn-${n.n}`} dir="auto" className={`tei-block ${sc === "ur" ? "font-ur" : sc === "ar" ? "font-ar" : ""}`}><span className="c-muted num" dir="ltr">{n.n}. </span>{inline(splitAnchors(n.text).text, prefix)}</li>
          })}
        </ol>
      )}
    </>
  )
}

export const Markdown = memo(Body)
