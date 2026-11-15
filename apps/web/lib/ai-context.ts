/**
 * Ask AI context: fetching (through the same-origin proxy), revalidating and assembling it.
 * Client-side module. `buildContext` is the ONLY place that assembles what the AI receives; the context view renders from its result.
 */
import { loadContextUnits } from "@/lib/actions"
import { getMany, putMany, type CachedUnit } from "@/lib/ai-context-cache"
import { titleOf } from "@/lib/types"

export const AI_MAX_CHARS = 600_000 // fallback; the API reports the real cap with every context-units response
export const CHARS_PER_TOKEN = 3 // rough: Arabic / Urdu script tokenizes worse than English
export const tokensOf = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN)
export const fmt = (n: number) => n.toLocaleString("en-US")

/** Fallback used when the book's author has no persona prompt. */
export const DEFAULT_SYSTEM_PROMPT = `You are a careful assistant for a Sunni (Ahl as-Sunnah wa'l-Jama'ah) library. Answer ONLY from the selected texts below and cite the book, chapter and topic for every claim. If the answer is not in the provided texts, say so — do not guess, and do not issue new fatwas. For rulings, advise the user to consult a qualified scholar.`

export type ContextSection = { id: string; header: string; markdown: string }
export type BuiltContext = { system: string; sections: ContextSection[]; text: string; chars: number; tokens: number }

/** Assembles the exact string the AI receives: system prompt, then every unit under a title header. The context view renders these same parts. */
export function buildContext(units: CachedUnit[], authorPrompt?: string | null): BuiltContext {
  // the author's persona (Author.prompt) leads; the grounding rules always follow so the AI stays inside the selected texts
  const system = authorPrompt ? `${authorPrompt}\n\n---\n\n${DEFAULT_SYSTEM_PROMPT}` : DEFAULT_SYSTEM_PROMPT
  const sections = units.map((u, i) => ({
    id: u.id,
    header: `=== TEXT ${i + 1} OF ${units.length}: ${[...u.path, titleOf(u.title)].join(" › ")} ===`,
    markdown: u.markdown,
  }))
  const text = [system, ...sections.map((s) => `${s.header}\n\n${s.markdown}`)].join("\n\n")
  return { system, sections, text, chars: text.length, tokens: tokensOf(text.length) }
}

export type UnitStatus = "pending" | "loading" | "done" | "error" | "missing"
export type Target = { id: string; slug?: string; title?: string }

class Missing extends Error {}

const proxyUrl = (book: string, slug: string) => `/api/ai/books/${encodeURIComponent(book)}/chapters/${encodeURIComponent(slug)}/markdown`

/** One chapter's Markdown. With a cached copy it revalidates (If-None-Match): 304 keeps the cached text. Throws Missing on 404. */
async function fetchUnit(book: string, slug: string, cached: CachedUnit | undefined, signal?: AbortSignal): Promise<CachedUnit> {
  const res = await fetch(proxyUrl(book, slug), { cache: "no-cache", signal, headers: cached?.etag ? { "if-none-match": cached.etag } : {} })
  if (res.status === 304 && cached) return { ...cached, storedAt: Date.now() }
  if (res.status === 404) throw new Missing()
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const d = ((await res.json()) as { data: { id: number; slug: string; title: CachedUnit["title"]; breadcrumb: { titleEn: string | null; titleAr: string | null; titleUr: string | null }[]; markdown: string; chars: number; updatedAt: string } }).data
  return {
    id: String(d.id), slug: d.slug, book, title: d.title,
    path: d.breadcrumb.map((b) => titleOf({ en: b.titleEn, ar: b.titleAr, ur: b.titleUr })),
    markdown: d.markdown, chars: d.chars, updatedAt: d.updatedAt, etag: res.headers.get("etag"), storedAt: Date.now(),
  }
}

/** Looks up the slug of a unit id (needed on a shared link, which only carries ids). Throws Missing if the id is not a unit of this book. */
async function slugOf(book: string, id: string): Promise<string> {
  const r = await loadContextUnits(book, `chapter:${id}`)
  if ("notFound" in r) throw new Missing()
  if (!("units" in r)) throw new Error("lookup failed")
  const u = r.units.units.find((x) => x.id === id)
  if (!u) throw new Missing()
  return u.slug
}

/**
 * Loads (cache -> revalidate -> network) every target with limited concurrency and reports each status change.
 * Failed ones end as "error" (retry by calling again with just those); 404s end as "missing". Results land in the cache as they arrive.
 */
export async function loadContext(
  book: string,
  targets: Target[],
  opts: { concurrency?: number; signal?: AbortSignal; onStatus: (id: string, s: UnitStatus, unit?: CachedUnit) => void },
): Promise<void> {
  const cached = await getMany(targets.map((t) => t.id))
  const queue = [...targets]
  targets.forEach((t) => opts.onStatus(t.id, "pending"))
  const work = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      if (opts.signal?.aborted) return
      opts.onStatus(t.id, "loading")
      const old = cached.get(t.id)
      try {
        const slug = t.slug ?? old?.slug ?? (await slugOf(book, t.id))
        let unit: CachedUnit
        try {
          unit = await fetchUnit(book, slug, old, opts.signal)
        } catch (e) {
          if (e instanceof Missing || !old || opts.signal?.aborted) throw e
          unit = old // network trouble: the cached copy is still usable
        }
        await putMany([unit])
        opts.onStatus(t.id, "done", unit)
      } catch (e) {
        if (opts.signal?.aborted) return
        opts.onStatus(t.id, e instanceof Missing ? "missing" : "error")
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, targets.length) }, work))
}
