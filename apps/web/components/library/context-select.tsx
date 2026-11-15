"use client"

/** Selection mode for the contents tree (Ask AI context picker): state hook + the tri-state checkbox. ChapterBrowser renders it; this file holds no tree. */
import { useCallback, useMemo, useRef, useState } from "react"
import { loadContextUnits } from "@/lib/actions"
import { AI_MAX_CHARS } from "@/lib/ai-context"
import type { ChapterItem, ContextUnit } from "@/lib/types"

export type CheckState = "all" | "some" | "none"
type Members = { units: ContextUnit[] } | { error: string }

export const chapterKey = (id: string) => `chapter:${id}`
export const volumeKey = (slug: string) => `volume:${slug}`
/** The item as ONE selectable unit when it is (a chapter owning text, or a booklet without chapters); null when ticking it must expand to several units. */
export const unitOf = (c: ChapterItem): ContextUnit | null => {
  const direct = c.level === 2 ? !!c.chars : c.level === 1 && !!c.chars && c.subtreeChars === c.chars
  return direct ? { id: c.id, slug: c.slug, level: c.level, en: c.en, ar: c.ar, ur: c.ur, chars: c.chars! } : null
}

export type SelectApi = {
  /** true while the chosen context is being fetched: the tree is frozen */
  locked: boolean
  cap: number
  stateOf: (key: string, trail: string[], unit: ContextUnit | null) => CheckState
  needsResolve: (key: string, trail: string[], unit: ContextUnit | null) => boolean
  resolve: (key: string) => void
  toggle: (key: string, trail: string[], unit: ContextUnit | null) => void
  busy: (key: string) => boolean
  note: (key: string) => string | undefined
}

export function useContextSelection(book: string, locked: boolean) {
  const [selected, setSelected] = useState<Map<string, ContextUnit>>(new Map())
  const [members, setMembers] = useState<Map<string, Members>>(new Map())
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set())
  const [cap, setCap] = useState(AI_MAX_CHARS)
  const [touch, setTouch] = useState<Map<string, Set<string>>>(new Map()) // unresolved ancestor -> unit ids ticked directly below it
  const inflight = useRef(new Map<string, Promise<Members>>())

  const tri = useCallback((ids: string[]): CheckState => {
    const n = ids.filter((i) => selected.has(i)).length
    return n === 0 ? "none" : n === ids.length ? "all" : "some"
  }, [selected])
  const idsOf = (m: Members | undefined) => (m && "units" in m ? m.units.map((u) => u.id) : null)

  const stateOf = useCallback((key: string, trail: string[], unit: ContextUnit | null): CheckState => {
    if (unit) return selected.has(unit.id) ? "all" : "none"
    const own = idsOf(members.get(key))
    if (own) return own.length ? tri(own) : "none"
    for (let i = trail.length - 1; i >= 0; i--) {
      const a = idsOf(members.get(trail[i]!))
      if (a) { const t = tri(a); if (t !== "some") return t; break } // partially ticked ancestor: this node is resolved on demand
    }
    const t = touch.get(key)
    return t && [...t].some((i) => selected.has(i)) ? "some" : "none"
  }, [selected, members, touch, tri])

  const needsResolve = useCallback((key: string, trail: string[], unit: ContextUnit | null) => {
    if (unit || members.has(key) || busyKeys.has(key)) return false
    return stateOf(key, trail, null) === "some" || (() => {
      for (let i = trail.length - 1; i >= 0; i--) {
        const a = idsOf(members.get(trail[i]!))
        if (a) return tri(a) === "some"
      }
      return false
    })()
  }, [members, busyKeys, stateOf, tri])

  const resolve = useCallback((key: string): Promise<Members> => {
    const running = inflight.current.get(key)
    if (running) return running
    setBusyKeys((s) => new Set(s).add(key))
    const p = loadContextUnits(book, key).then((r): Members => {
      if ("units" in r) { setCap(r.units.maxChars); return { units: r.units.units } }
      if ("tooLarge" in r) return { error: r.message }
      if ("notFound" in r) return { error: "This item no longer exists." }
      return { error: "Could not load this item. Try again." }
    }).catch((): Members => ({ error: "Could not load this item. Try again." }))
    inflight.current.set(key, p)
    void p.then((m) => {
      inflight.current.delete(key)
      setMembers((o) => new Map(o).set(key, m))
      setBusyKeys((s) => { const n = new Set(s); n.delete(key); return n })
    })
    return p
  }, [book])

  const apply = (units: ContextUnit[], on: boolean) =>
    setSelected((o) => { const n = new Map(o); units.forEach((u) => (on ? n.set(u.id, u) : n.delete(u.id))); return n })

  const toggle = useCallback((key: string, trail: string[], unit: ContextUnit | null) => {
    if (unit) {
      const on = !selected.has(unit.id)
      apply([unit], on)
      setTouch((o) => { const n = new Map(o); trail.forEach((k) => n.set(k, new Set(n.get(k)).add(unit.id))); return n })
      return
    }
    const known = members.get(key)
    if (known) {
      if ("units" in known) apply(known.units, stateOf(key, trail, null) !== "all")
      else { setMembers((o) => { const n = new Map(o); n.delete(key); return n }); void resolve(key).then((m) => "units" in m && apply(m.units, true)) } // retry after an error
      return
    }
    const on = stateOf(key, trail, null) !== "all" // unresolved: "all" only when inherited from a ticked ancestor, otherwise nothing / some -> tick everything
    void resolve(key).then((m) => "units" in m && apply(m.units, on))
  }, [selected, members, stateOf, resolve])

  const api: SelectApi = useMemo(() => ({
    locked, cap, stateOf, needsResolve, resolve: (k) => void resolve(k), toggle,
    busy: (k) => busyKeys.has(k),
    note: (k) => { const m = members.get(k); return m && "error" in m ? m.error : undefined },
  }), [locked, cap, stateOf, needsResolve, resolve, toggle, busyKeys, members])

  const units = useMemo(() => [...selected.values()], [selected])
  return { api, units, chars: units.reduce((s, u) => s + u.chars, 0), resolving: busyKeys.size > 0 }
}

/** The visual checkbox (the real <input> is sr-only next to it). */
export function CheckBox({ state, busy = false }: { state: CheckState; busy?: boolean }) {
  if (busy) return <span className="c-muted grid h-5 w-5 shrink-0 place-items-center" role="status" aria-label="Resolving"><svg className="animate-spin" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9" /></svg></span>
  return (
    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] text-white ${state === "none" ? "bd-line" : "bg-lib-accent border-transparent"}`} aria-hidden>
      {state === "all" ? "✓" : state === "some" ? "–" : ""}
    </span>
  )
}
