export type Width = "narrow" | "medium" | "wide"
export type Theme = "default" | "sepia"
export type Prefs = {
  collapsed: boolean
  autoHide: boolean
  width: Width
  lh: number // line height multiplier
  rtl: number // Arabic/Urdu size multiplier
  theme: Theme
}
export const DEFAULT_PREFS: Prefs = { collapsed: false, autoHide: false, width: "medium", lh: 1, rtl: 1, theme: "default" }
export const WIDTHS: Record<Width, string> = { narrow: "36rem", medium: "46rem", wide: "64rem" }

export function typingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable)
}

const MARKS = /[ً-ٰٟۖ-ۭ]/g
export const norm = (s: string) => s.replace(MARKS, "").toLowerCase()
