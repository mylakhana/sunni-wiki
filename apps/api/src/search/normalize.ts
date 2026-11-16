/**
 * Search-text normalization rules for Urdu / Arabic, written once as DATA so that
 *   - the OpenSearch analyzers (index-definition.ts) are generated from them, and
 *   - the JS functions below (query building, tests) behave identically.
 *
 * Only characters are folded here; tokenizing/stemming happens in OpenSearch. Stored/displayed text is never changed.
 */

/** Marks stripped before matching: harakat/tashkeel (064B–065F, 0610–061A), superscript alef 0670 (اللّٰہ),
 *  Quranic annotation marks 06D6–06ED, tatweel 0640, zero-width/bidi controls and BOM. */
export const STRIP_CLASS =
  "[\\u0610-\\u061A\\u064B-\\u065F\\u0670\\u06D6-\\u06ED\\u0640\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF]"

/** Honorific ligatures (ﷺ ﷻ and the other Arabic-presentation honorific glyphs) are dropped so
 *  "حضور ﷺ نے" matches "حضور نے". The written-out formulas (رضی اللہ عنہ …) are NOT stripped. */
export const HONORIFIC_CLASS = "[\\uFDF0\\uFDF1\\uFDF3-\\uFDFB]"

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String.fromCharCode(from + i))
const digitEntries = (): [string, string][] => [
  ...range(0x0660, 0x0669).map((c, i) => [c, String(i)] as [string, string]), // ٠-٩ Arabic-Indic
  ...range(0x06f0, 0x06f9).map((c, i) => [c, String(i)] as [string, string]), // ۰-۹ Eastern Arabic-Indic (Urdu)
]

/** ﷲ (U+FDF2) expands to the word الله in each script's canonical letters. */
const ALEF_FOLDS: [string, string][] = [
  ["أ", "ا"],
  ["إ", "ا"],
  ["آ", "ا"],
  ["ٱ", "ا"],
]

/** Urdu canonical forms: ی ک ہ. ھ (do-chashmi heh, a real Urdu letter: کھ ≠ کہ) and ے (yeh barree) stay distinct. */
export const URDU_FOLDS: [string, string][] = [
  ["ي", "ی"],
  ["ى", "ی"],
  ["ې", "ی"],
  ["ك", "ک"],
  ["ڪ", "ک"],
  ["ة", "ہ"],
  ["ۃ", "ہ"],
  ["ه", "ہ"],
  ["ۀ", "ہ"],
  ...ALEF_FOLDS,
  ["ﷲ", "اللہ"],
  ...digitEntries(),
]

/** Arabic canonical forms (Arabic keyboard letters), so Urdu-keyboard text matches Arabic text. ة/ى/ alef-hamza are
 *  finished by Lucene's arabic_normalization filter in the analyzer. */
export const ARABIC_FOLDS: [string, string][] = [
  ["ی", "ي"],
  ["ې", "ي"],
  ["ے", "ي"],
  ["ک", "ك"],
  ["ڪ", "ك"],
  ["ہ", "ه"],
  ["ھ", "ه"],
  ["ۃ", "ه"],
  ["ۀ", "ه"],
  ...ALEF_FOLDS,
  ["ﷲ", "الله"],
  ...digitEntries(),
]

/** Entries as OpenSearch `mapping` char_filter rules ("a=>b"). */
export const toMappings = (entries: [string, string][]) => entries.map(([a, b]) => `${a}=>${b}`)

const stripRe = new RegExp(STRIP_CLASS, "g")
const honorificRe = new RegExp(HONORIFIC_CLASS, "g")

function fold(s: string, entries: [string, string][], honorific = true): string {
  const map = new Map(entries)
  // ﷲ (ﷲ) is inside HONORIFIC_CLASS's gap on purpose (FDF2 is excluded there), so it is folded by the map.
  let out = s.replace(stripRe, "")
  if (honorific) out = out.replace(honorificRe, "")
  let r = ""
  for (const ch of out) r += map.get(ch) ?? ch
  return r.normalize("NFC")
}

/** JS twin of the `ur_norm` char filters (no tokenizing/lowercasing of Latin). */
export const normalizeUrdu = (s: string) => fold(s, URDU_FOLDS)
/** JS twin of the `ar_norm` char filters (the analyzer also applies Lucene's arabic_normalization + stemmer). */
export const normalizeArabic = (s: string) => fold(s, ARABIC_FOLDS)

export type Lang = "ur" | "ar" | "en"

/** Script-based guess for text with no xml:lang: Latin → en; Urdu-only letters → ur; Arabic-only letters → ar; else ur. */
export function detectLang(text: string): Lang {
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  const arabicScript = (text.match(/[؀-ۿ]/g) ?? []).length
  if (latin > arabicScript) return "en"
  if (/[ٹڈڑںھےگپچژۃ۔]/.test(text)) return "ur"
  if (/[كيةى]/.test(text)) return "ar"
  return "ur"
}
