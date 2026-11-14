import { titleOf, type Titles } from "@/lib/types"

/** Chapter / volume title in every available language; missing languages are skipped. `big` sizes in em so it follows the reader's text size. */
export function ChapterTitles({ t, big = false }: { t: Titles; big?: boolean }) {
  const any = !!(t.ar || t.ur || t.en)
  if (!any) return <div className={big ? "text-[1.25em] sm:text-[1.5em]" : "text-[13px]"}>{titleOf(t)}</div>
  return (
    <>
      {t.ar && <div className={`font-ar ${big ? "text-[2.25em] leading-[1.6] sm:text-[3em]" : "text-right text-lg leading-[1.6]"}`} dir="rtl">{t.ar}</div>}
      {t.ur && <div className={`font-ur c-muted ${big ? "text-[1.5em] leading-[2.2] sm:text-[1.875em]" : "text-right text-sm leading-[2]"}`} dir="rtl">{t.ur}</div>}
      {t.en && <div className={`${big ? "text-[1.25em] sm:text-[1.5em]" : "text-[13px]"} font-semibold tracking-tight`}>{t.en}</div>}
    </>
  )
}
