# Data import — Fatawa Razawiyyah (legacy CSV → TEI → DB)

Source: `data-extracted/01 Fatawa Razaviyya/` (31 `jild` folders + `Images/`, untouched).

## Run order (from `apps/api`)
1. `python3 scripts/seed_fatawa_razawiyyah.py` — Author, Category, Book, 31 Volumes (`1a,1b,2..30`). Idempotent.
2. `cd scripts && python3 -m fatawa.build --all` — CSV → `scripts/out/<vol>/chapters.json` + `scripts/out/report.json` (git-ignored). `--dry-run`, `--volume N` supported.
3. `python3 scripts/import_fatawa.py --all` — wipes the volumes' chapters/content, then inserts. Idempotent.

## Source format
- `TextContainer.csv` `SNo,Description,PageNo,TextP,DataOrder,Alignment` — rows in reading order. `DataOrder`/`Alignment` always empty. `PageNo` = digital page chunk. `TextP` = paragraph type (h, hc, u, uc, a, ac, q, qc, t, tc, s, sc, i, e/ec, c, **w = RTF blob**). ~30 dirty codes are normalised (`normalize_code`, every remap logged in the report).
- `IndexContainer.csv` — TOC only; dotted `IndexNo`. Titles are not present in the text.
- `Map.csv` — `IndexNo → PageNo` and `PageNo → BookPageNo` (printed pages, shown as `<pb n="89-96">`).
- UTF-8 with BOM, multiline quoted cells.

## Linking rule (best effort, accepted)
A TOC leaf only points to a *page*. Units start at heading rows or "مسئلہ N" rows; leaves are placed in **page order** on the k-th start row of their page. Placed leaves (+ ancestors) become `chapters`; each leaf's TEI runs to the next placed leaf. Text before the first placed leaf = `front` chapter. Every other TOC title is kept as an invisible `<index indexName="toc" n=… ><term>…</term></index>` at its page. Current result: 4834 of 26854 leaves placed; all 140k rows are emitted exactly once (parity checked), every fragment is well-formed XML.

## TEI mapping
h/hc → `<head>`; u/uc/c → `<p xml:lang="ur">`; a → `<p xml:lang="ar">`; ac → `<quote xml:lang="ar">`; q/qc → `<quote type="quran">`; t/tc → `<note type="citation">`; s/sc → `<note type="footnote" place="foot">` (pure separators dropped); i → `<figure><graphic url="Images/NAME"/>`; e/ec → `<p xml:lang="en">`; question/answer → `<ab type="question|answer">`; RTF → inline `<quote type="quran">` / `<foreign xml:lang>` by run font (Quranic_Font = Quran, Nafees Web Naskh/Al_Mushaf = Arabic, Alvi/Aslam = Urdu), bold → `<hi rend="bold">`, tab rows → `<table>`.
RTF decoder = copy of `docs/rtf_convert.py` decoder (`scripts/fatawa/rtf_decode.py`); the HTML layer was replaced by the TEI emitter.

## Known gaps (report-only)
- Most TOC entries are sub-topic titles inside a fatwa (not placeable) → anchors only.
- Images are not copied or renamed; stray files (`xx.jpg`, `zz.jpg`, `2626.jpg`) and the vol-1 prefix ambiguity (1A/1B) are only referenced by name from `TextP=i` rows.
- A few TOC nodes point to pages without rows (vols 6, 13, 15, 27): listed as `toc_dropped_no_page` in the report; vol 4 has an outlier PageNo 2323.
