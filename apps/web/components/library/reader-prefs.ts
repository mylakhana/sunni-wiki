export type Prefs = { collapsed: boolean } // contents sidebar hidden on desktop
export const DEFAULT_PREFS: Prefs = { collapsed: false }

export function typingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable)
}
