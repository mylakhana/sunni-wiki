# scripts — data conversion & import

Python scripts that convert the legacy (messy) CSV data into the format the
database expects, then import it.

Pipeline: analyze CSVs -> convert to target format -> wipe old data -> import.
The import step cleans all previous data before adding new data.

## Fatawa Razawiyyah (`data-extracted/01 Fatawa Razaviyya/`)

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
