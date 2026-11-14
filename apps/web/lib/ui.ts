/** Small presentation helpers (safe for server and client). */
export const initials = (name: string) =>
  name
    .replace(/^(Imam|Shaykh|Sheikh|Allama|Mufti|Maulana)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")

/** Stable 32-bit hash of a string. */
export function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Deterministic avatar colour for an author, derived from the slug. */
export const authorColor = (slug: string) => `hsl(${hash(slug) % 360} 45% 32%)`

/** Deterministic cover gradient (light, dark) for a book, derived from the slug. */
export function bookHue(slug: string): [string, string] {
  const h = hash(slug) % 360
  return [`hsl(${h} 50% 30%)`, `hsl(${h} 55% 14%)`]
}

const LANG_NAMES: Record<string, string> = { ar: "Arabic", ur: "Urdu", en: "English", fa: "Persian" }
/** "ar" -> "Arabic"; unknown values are shown as given. */
export const langName = (l: string) => LANG_NAMES[l.toLowerCase()] ?? l
