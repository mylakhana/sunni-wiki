# scripts — data conversion & import

Python scripts that convert the legacy (messy) CSV data into the format the
database expects, then import it.

Pipeline: analyze CSVs -> convert to target format -> wipe old data -> import.
The import step cleans all previous data before adding new data.

## Fatawa Radawiyyah (`data-extracted/01 Fatawa Razaviyya/`)

Full analysis + conversion plan: `~/.claude/plans/see-the-data-extracted-01-fatawa-adaptive-ripple.md`.

- `seed_fatawa_razawiyyah.py` — creates Author, Category, Book and the 31 Volumes (`1a`,`1b`,`2`..`30`).
  Idempotent; wipes the book's volumes/chapters/content first. `--dry-run` only validates the folders.
- Folder → slug: `jild 1.1A`→`1a`, `jild 1.2B`→`1b`, `jild N`→`N`.
- Per volume: `TextContainer.csv` (content, row order = reading order, `TextP` = paragraph type, `w` = RTF blob),
  `IndexContainer.csv` (TOC only, dotted IndexNo hierarchy), `Map.csv` (IndexNo→digital PageNo + printed `BookPageNo`;
  rows with empty IndexNo give PageNo→BookPageNo). All CSVs are UTF-8 with BOM.
- TOC ↔ text is only linkable at page level (digital PageNo); fatwa boundaries come from "مسئلہ N" rows.
- Target: TEI fragment per Chapter stored in `content.tei` (schema already supports this).

### Pipeline status
`seed_fatawa_razawiyyah.py` → `fatawa/build.py` (CSV→TEI JSON, `out/`) → `import_fatawa.py` (DB). Done for all 31 volumes;
see `apps/api/docs/data-import-fatawa-razawiyyah.md`.
Chapter model: `chapters.level` 0 = group (کتاب/باب), 1 = booklet (رسالہ), 2 = chapter, 3 = sub-topic (`anchorId` → `<anchor xml:id>` in the parent TEI). Booklets and chapters own TEI.

### Markdown size backfill (`backfill-markdown-chars.ts`)
TypeScript script (run with `tsx`, from `apps/api`). Converts every `content.tei` with the API's `tei-markdown.service` and stores the length in `content.markdown_chars`. Idempotent; re-run after any TEI change. The Ask-AI picker and TOC `markdownChars`/`subtreeChars` read this column.

Run order: `seed_fatawa_razawiyyah.py` -> `fatawa/build.py` -> `import_fatawa.py` -> `backfill-markdown-chars.ts` (also called at the end of the import so new data always has sizes). Needs the `markdown_chars` migration applied first (`prisma migrate deploy`).

## Bahar-e-Shariat (`data-extracted/02 Bahar e Shariyat/`)
- `seed_bahar_e_shariat.py` (author Sadrushariyah Mufti Amjad Ali Aazmi, category `fiqh`, book `bahar-e-shariat`, volumes `1`..`19`, `19z` = Zameema, `20`) → `bahar/build.py` (CSV→TEI JSON in `out/bahar-e-shariat/`) → `import_bahar.py`.
- Differs from Fatawa: no `Map.csv` (Index/Text `PageNo` share one printed-page numbering); detailed TOC is `2.*` (`1.*` = summary, ignored); `2.NN` = chapter, `2.NN.MM` = sub-topic anchor; TextP `r` = verse; image rows hold `Takhreej/Images/<file>`.
- Data defects handled: displaced rows appended at file end (title page, front matter, stray paragraphs/images) are re-ordered by page/DataOrder; vol 1 has **no TextContainer.csv** (TOC imported as empty chapters); vol 13 index has bogus pages for 2.04/2.05 (empty chapters); vol 6 2.01/2.02 share a page (2.02 empty).

## Post-import text fixes

`python3 scripts/fix_text.py [--apply]` runs exact-match replacements on `content.tei` after all imports are done (dry run by default). Add new fixes to the `FIXES` list in the script.

## Books 03-05: Miraat-ul-Manajeeh, Faizan e Riaz ul Saliheen, Siraat ul Jinaan
Generic pipeline in `multibook/` (config per book: `multibook/config.py`; slugs `miraat-ul-manajeeh`, `faizan-e-riaz-ul-saliheen`, `siraat-ul-jinaan`; categories `hadith`, `tafseer`):
`python3 scripts/seed_books.py --book X` → `cd scripts && python3 -m multibook.build --book X --all` → `python3 scripts/import_books.py --book X --all` (or `import_all.py --book miraat|faizan|siraat`). Output in `out/<book slug>/`.
Analysis tool for any CSV volumes (read-only): `python3 analyze_csv.py [--dir <book dir>]`. Findings + decisions: `apps/api/docs/data-import-multibook.md`.
