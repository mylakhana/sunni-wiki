const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'" }
const decode = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (m) => ENTITIES[m] ?? m)

/**
 * Renders a server-produced snippet. The API escapes everything and wraps matches in <mark>…</mark> only; we never use
 * dangerouslySetInnerHTML: the string is split on the mark tags and every piece becomes a plain React text node.
 */
export function SearchSnippet({ html, lang }: { html: string; lang: string }) {
  const parts = html.split(/(<mark>|<\/mark>)/)
  let inMark = false
  const nodes: React.ReactNode[] = []
  parts.forEach((p, i) => {
    if (p === "<mark>") inMark = true
    else if (p === "</mark>") inMark = false
    else if (p) nodes.push(inMark ? <mark key={i} className="rounded-sm bg-(--lib-accent-soft) px-0.5 text-inherit">{decode(p)}</mark> : decode(p))
  })
  const cls = lang === "ur" ? "font-ur text-lg leading-[2.2]" : lang === "ar" ? "font-ar text-xl leading-[2]" : "text-sm leading-relaxed"
  return <p className={cls} dir={lang === "en" ? "ltr" : "rtl"} lang={lang}>{nodes}</p>
}
