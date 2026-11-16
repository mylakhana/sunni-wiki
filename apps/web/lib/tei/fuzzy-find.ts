/**
 * Find `query` in `text` (both already diacritic-stripped, single-spaced). Exact match first; otherwise a
 * gap-tolerant word match, because search snippets may omit honorific phrases that the book text contains
 * (e.g. "عیسیٰ [عَلَیْہِ الصَّلٰوۃُ وَالسَّلَام] آسمان"). Returns [start, end) char offsets in `text`.
 */
const MAX_GAP = 90

export function fuzzyFind(text: string, query: string, from = 0): [number, number] | null {
  const a = text.indexOf(query, from)
  if (a >= 0) return [a, a + query.length]
  const words = query.split(" ").filter(Boolean)
  if (words.length < 2) return null
  let start = text.indexOf(words[0]!, from)
  while (start >= 0) {
    if (start === 0 || text[start - 1] === " ") {
      let end = start + words[0]!.length
      let ok = true
      for (let i = 1; i < words.length && ok; i++) {
        const w = words[i]!
        let at = text.indexOf(w, end)
        while (at >= 0 && at - end <= MAX_GAP && !(text[at - 1] === " " && at > end)) at = text.indexOf(w, at + 1)
        if (at < 0 || at - end > MAX_GAP) ok = false
        else end = at + w.length
      }
      if (ok) return [start, end]
    }
    start = text.indexOf(words[0]!, start + 1)
  }
  return null
}
