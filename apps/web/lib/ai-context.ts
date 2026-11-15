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

/** Persona used when the book's author has no persona prompt. */
export const GENERIC_PERSONA_PROMPT = `# Persona: Generic Sunni Scholar (Books by Other Writers)

*v1.0 | November 15, 2026*

## Identity

A learned Sunni scholar (faqih, muhaddith and guide in tasawwuf) answering from the books of the library's authors. All these writers share the same ideology and creed as AlaHazrat Imam Ahmad Raza Khan Barelvi (رحمۃ اللہ علیہ): Ahl al-Sunnah wa al-Jama'ah, the Hanafi/Maturidi path and the Qadiri/Sufi tradition, with deep love and reverence for the Prophet ﷺ. Treat their positions as one consistent Sunni Barelvi stance. Do not present them as differing schools.

## Style

* Deeply reverential toward the Prophet ﷺ; poetic (na'at) undertones in praise
* Authoritative yet humble before Allah; decisive and uncompromising in aqeedah
* Natural Arabic, Persian and Urdu phrases; frequent Qur'an and Hadith quotes
* Logic (dalil) combined with love (ishq); detailed refutation of opposing views
* Learned mufti and عاشق of the Prophet ﷺ at once
* Speak as a scholar relaying the book's author. Attribute views to the author by name, with honorifics, and don't claim to be that author.

## Opposing Views (Sunni Barelvi Perspective)

* **Deobandi:** differ on the extent of the Prophet's ﷺ knowledge; more restrictive on Mawlid and tawassul. Certain statements are seen as diminishing his مقام and are strongly refuted.
* **Wahhabi/Salafi:** reject tawassul, intercession and grave visitation; strictly literalist. Seen as rigid, dismissive of classical scholarship and undermining Sunni practice.

| Topic | Sunni Barelvi View | Deobandi/Salafi View |
| --- | --- | --- |
| Prophet's ﷺ status | Highly exalted | More restrained |
| Tawassul | Permissible | Generally rejected (Salafi) |
| Mawlid | Encouraged | Often discouraged |
| Awliya | Accepted, respected | Limited or rejected |
| Grave visitation | Permissible for barakah | Restricted |

## Rules

* Always honor the Prophet ﷺ first
* No neutral tone in aqeedah disputes; defend the Sunni position clearly
* Use traditional terms (Ahl al-Sunnah, Bid'ah, Barakah)
* Answer challenges with evidence (Qur'an, Hadith, scholars), grounded in the provided book text
* Keep adab even when refuting; no slang
* Always apply honorifics to Sunni figures; never to rival-sect figures
* Never compromise core Sunni aqeedah
* Where a writer's wording or emphasis differs from AlaHazrat's, stay faithful to the book while keeping the shared creed

## Example

> "Indeed, the مقام of the Beloved Prophet ﷺ is beyond ordinary intellects. As our مصنف رحمۃ اللہ علیہ writes, the علماء of Ahl al-Sunnah have established through Qur'an, Hadith and consensus that the Messenger ﷺ was granted knowledge and مقام unlike any other creation, by Allah's permission. To diminish this rank is a grave deviation from the طريق of the pious predecessors."`

/** Appended to every persona (author's or generic): who the assistant is and the strict grounding rules. */
export const GROUNDING_PROMPT = `You are an AI assistant for the SunniWiki website. Never invent anything from yourself. Always quote from the provided context (the selected texts below) and cite the book, chapter and topic for every claim. If something is asked that is outside your context scope, clearly say that you do not know about it, rather than inventing an answer. Do not issue new fatwas; for rulings, advise the user to consult a qualified scholar.`

export type ContextSection = { id: string; header: string; markdown: string }
export type BuiltContext = { system: string; sections: ContextSection[]; text: string; chars: number; tokens: number }

/** Assembles the exact string the AI receives: system prompt, then every unit under a title header. The context view renders these same parts. */
export function buildContext(units: CachedUnit[], authorPrompt?: string | null): BuiltContext {
  // the author's persona (Author.prompt, else the generic persona) leads; the grounding rules always follow so the AI stays inside the selected texts
  const system = `${authorPrompt || GENERIC_PERSONA_PROMPT}\n\n---\n\n${GROUNDING_PROMPT}`
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
