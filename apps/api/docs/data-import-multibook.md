# Data import — Miraat-ul-Manajeeh, Faizan e Riaz ul Saliheen, Siraat ul Jinaan (books 03-05)

One config-driven pipeline (`apps/api/scripts/multibook/`) instead of three copies: the three books share Bahar-e-Shariat's CSV family. It is still isolated per book (DB rows looked up by `books.slug`, clean/delete scoped to that `bookId`, output in `scripts/out/<book slug>/`), shared Fatawa/Bahar code is only imported unmodified (`fatawa.tei`, `fatawa.rtf_decode`, `bahar.build` helpers) and the RTF converter is a **copy** (`multibook/rtf.py`) with these books' fonts.

Run (from `apps/api`): `python3 scripts/import_all.py --skip-seed --book miraat --book faizan --book siraat`, or per step: `scripts/seed_books.py --book X` → `cd scripts && python3 -m multibook.build --book X --all` → `scripts/import_books.py --book X --all`.

After each import (content search): `pnpm search:reindex --book <book-slug>` (from `apps/api`, OpenSearch running) — rebuilds this book's content-search index (see `apps/api/docs/search-index.md`).

| book key | book slug | author slug | category | volumes |
|---|---|---|---|---|
| miraat | `miraat-ul-manajeeh` — Miraat ul Manajeeh Sharah Mishkaat Ul Masabeeh | `hakeem-ul-ummat-mufti-ahmed-yaar-khan-naeemi-badayuni` | `hadith` | 1-8 |
| faizan | `faizan-e-riaz-ul-saliheen` (description = the Urdu title text supplied by the owner) | `hafiz-imam-muhiuddin-abu-zakariyya-yahya-bin-sharaf-nawawi` | `hadith` | 1,2,3,5,6,7 (**Jild 4 not in the extracted data**) |
| dalail | `dalail-ul-khairat` — Dalail ul Khairat (book 06, **no volumes**) | `imam-jazuli` (Shaikh Muhammad bin Sulaiman Al-Jazuli) | `durood` | none |
| siraat | `siraat-ul-jinaan` — Siraat ul Jinaan Fi Tafseer Al Quran | `mufti-muhammad-qassim-attari` | `tafseer` | 1-10 |

New categories `hadith` (sort 2) and `tafseer` (sort 3) are created by the seed (upsert). No `Images/` folders exist for these books.

## CSV analysis (`scripts/analyze_csv.py`)
All volumes: `IndexContainer.csv` (IndexNo, IndexText, PageNo) + `TextContainer.csv` (SNo, Description, PageNo, TextP, DataOrder, Alignment); UTF-8 with BOM; no `Map.csv`; Index and Text `PageNo` share one numbering.
- **Miraat**: rows are `h`/`u` (+ few `a`,`ac`,`uc`,`r`,`q*`, `w`, and dirty codes `''`,`I`,`H`,`0`). TOC `1.*`, depth 1 = كتاب/باب, depth 2 = باب. Index file order is arbitrary (e.g. 1.04.01 last) → sorted by IndexNo. Vol 1 front matter (page ≤ 0) sits at the file end. Text PageNo defects: isolated typos (5479, 425, 488…) and, in vol 2, a displaced block of ~90 rows (pages 19-40 stored after page 237).
- **Faizan**: every row is an RTF blob = one printed page (PageNo = row number). Vol 1 has two TOCs (`1.*` summary w/o pages, `2.*` detailed, depth up to 3); other volumes only `1.*`. Depth-1 nodes are "باب نمبر", "کتاب …" or "حدیث نمبر" depending on the volume. Some depth-1 nodes have no page.
- **Siraat**: every row is an RTF page (PageNo = row number); TOC `1.*`: depth 1 = پارہ/سورۃ/front, depth 2 = topics. Vol 6 has 19 junk index rows with title `\x01`.

## Conversion rules (`multibook/build.py`)
- TOC root = highest root with children (Faizan vol 1 → `2.*`). Depth-1 → chapter (`level 2`, owns TEI), deeper → sub-topic (`level 3`, `<anchor xml:id="s-NO"/>` in the chapter). Pageless nodes take their first descendant's page. Junk nodes with empty titles are dropped. Multi-line titles are joined with " - ".
- Faizan: depth-1 "حدیث نمبر" nodes after a "باب/کتاب" node are demoted to sub-topics of it (647 nodes), so chapters are the باب/کتاب where the volume has them.
- Rows → elements (RTF per paragraph via `multibook/rtf.py`, others via `fatawa.tei.row_to_tei`). A chapter/sub-topic starts at the paragraph whose heading matches the title on its page (3-gram similarity; fallback: any short paragraph ≥0.75, then the first element of the page) — so a page shared by two chapters is split at the heading.
- Row order: front matter first; out-of-order runs ≥ 8 rows = displaced blocks, re-inserted by page; shorter ones = PageNo typos, keep their position and take the previous page (Miraat: 4 blocks moved, 105 pages clamped).
- Text before the first chapter → "front" chapter (`titleEn = 'Front matter'`, becomes "مقدمہ" via `chapters_titles_sync.py`). Each emitted element count equals the source (parity check) and every chapter's TEI is XML-validated.
- RTF classification: heading style / centred ≥20pt Aslam-like font = `<head>`; ≤13pt = footnote; red/purple small = citation; Quran font = `<quote type="quran">`; Arabic-font runs inside Urdu text = `<foreign xml:lang="ar">`; tab-separated lines (≥2 cells) = `<table>`.

## Result (2026-11-15)
miraat 288 chapters / 99 with content; faizan 6046 / 278; siraat 3472 / 161. No collisions or unplaced chapters; 2 Faizan vol 1 sub-topics could not be placed (page beyond the text). Fatawa/Bahar rows were not touched.

## Known gaps
- Faizan chapter granularity follows the source TOC (باب/کتاب chapters; volumes without باب nodes such as vols 2 and 5 are chapter-per-entry/section).
- Sub-topic anchors inside RTF pages are matched by heading text; ~5% fall back to the page's first paragraph.

## Book 06 — Dalail ul Khairat (volume-less)
`volumes=None` in `config.BOOKS`: files sit directly in `data-extracted/06 Dalail ul Khairat/`; no Volume rows, `chapters.volumeId = NULL`, output in `out/dalail-ul-khairat/_/`, chapter slugs = IndexNo (`1.01`). Same RTF-per-page format as Siraat (335 pages -> 22 TOC chapters + front matter, parity OK). Run: `python3 scripts/import_all.py --skip-seed --book dalail`. New category `durood`.

## Bulk addition (`data-extracted/bulk-addition/`, 26 books by Imam Ahmed Raza Khan)
Each sub-folder = one volume-less book (`volumes=None`), author = existing `imam-ahmed-raza-khan` (the Fatawa seed must have run first). Book list/titles/slugs/categories: `config._BULK` (keys `b-<slug>`). Run: `python3 scripts/import_all.py --skip-seed --book bulk` (copy_media -> seed -> build -> import for all 26).
- Handles both families: RTF-page books (Dus Aqeeday, ...) and h/u/a/s/q/t-coded books through the same pipeline; `i` rows = page images -> `<figure><graphic url="/media/<file>"/>`.
- `Images/` (shared by several books) is copied by `scripts/copy_media.py` to `apps/web/public/media/` (not renamed per book).
- `demote_collisions`: a TOC entry resolving to the same paragraph as an earlier chapter becomes a sub-topic (anchor) of it instead of an empty chapter.
- New categories: `fatawa` (same row as the Fatawa seed), `aqaid`, `tasawwuf`, `rasail`, `durood`.
- Known gaps: **Malfoozat-e-Aala-Hazrat** text export stops at 5000 rows (pages 1-539 of ~800), so most of its TOC has no text; `Images/Jad-Ul-Mum-Tar-jild-2-(125).gif` belongs to no book here (copied, unreferenced).
