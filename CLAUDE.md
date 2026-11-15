# CLAUDE.md — How we work on this project

Read `AGENTS.md` too (Next.js here has breaking changes — check `node_modules/next/dist/docs/` before writing Next code).

## Source of truth: the concept docs

- The entire project concept lives in `docs/sunniwiki-concept/`. **Always refer to it whenever you need context**
- **Any big change** (core logic, new functionality, changed behavior) must be written back into the project's main documentation pages in `docs/sunniwiki-concept/` in the same piece of work.
- If the user asks for something that **contradicts the business logic in the concept docs**, do not just do it. Tell the user about the conflict and verify first.

## UI work

- Follow `docs/design-guidelines.md` for all UI work (shadcn components first, DRY — reuse existing components, etc.; double-check a component doesn't already exist before building one).

## Workflow 1 — Prototype

When the user asks for a **prototype**:

1. Create the new page with **dummy data only**. Do not connect it to the real API or database.
2. **English only** — no translations in prototypes.
4. **Log it in `docs/plans/pending-prototypes.md`** (the team's tracker for multiple developers): add a row under *Pending* with the page/route, the date and time it was created, and exactly which parts of the page are prototype (e.g. dummy table data, fake charts, non-working buttons/forms, no API calls).

## Workflow 2 — Make it dynamic

Once the user is happy with the prototype and asks to make it dynamic:

1. **Assess the whole project first** — read the relevant concept docs and existing code, and check `docs/plans/pending-prototypes.md` for the page's prototype entry (which parts are dummy).
2. **Write a plan** at `docs/plans/<plan-name>.md` with these sections:
   `Database`, `API`, `Web`, `Documentation`.
   Each section holds multiple tasks, **each with a status** (e.g. `todo` / `in progress` / `done`).
3. **Stop and ask the user to verify and confirm the plan.** Do not start implementing before they confirm.
4. After confirmation, **send multiple agents to work simultaneously** — 2–3 sections/phases at a time. Keep the plan file's task statuses updated as work completes.
5. When the page is dynamic, **update `docs/plans/pending-prototypes.md`**: move its row from *Pending* to *Completed* with the date and time it was made dynamic, what was wired, and the plan file. If only some parts were made dynamic, keep the row in *Pending* and update which parts are still prototype.
6. Do **not** do translations unless the user specifically asks.

## General rules

- **Git: every push must go to the `staging` branch only.** Before committing or pushing, confirm the current branch is `staging` (`git branch --show-current`). Never push to `main` or any other branch; promotion to `main` is done by the user.
- Never do half-baked work. Finish what you start: wire everything, update seeds, update docs, update plan statuses.
- Don't start dev servers (`pnpm dev`, etc.) — the server is already running in another terminal.
- Database: use `pnpm prisma migrate deploy` only; never `migrate dev` or `migrate reset`.
- Seeds: whenever you change anything in `apps/api/prisma/seed/`, run the seed yourself right away (`pnpm db:seed` from `apps/api`) so the data is upserted into the database — don't leave it for the user. Seeds must stay idempotent (upsert, never blind create).

## Data import (legacy CSV → database)

We have a huge collection of data in messy CSV files. It is converted and imported with Python scripts in `apps/api/scripts/`.

1. **Analyze first.** Before writing any script, inspect the current CSV formats (columns, encodings, delimiters, inconsistencies, duplicates, bad values) and document findings in `apps/api/scripts/README.md`.
2. **Convert.** Write Python scripts that transform the CSV data into the target format the database expects (match `apps/api/prisma/schema.prisma`).
3. **Import.** The scripts then import the converted data into the database.
4. **Clean before import.** The import must delete all previous data (in the affected tables, respecting FK order) before inserting the new data, so re-runs always produce the same result.
5. Keep all scripts in `apps/api/scripts/`; follow the database rules above (no `migrate dev`/`migrate reset`).

### Fatawa Radawiyyah import notes
- Source: `data-extracted/01 Fatawa Razaviyya/` (per-volume `IndexContainer.csv`, `Map.csv`, `TextContainer.csv`; `Images/` stays as-is). Details in `apps/api/scripts/README.md`.
- Run order (from `apps/api`): `python3 scripts/seed_fatawa_razawiyyah.py` → `cd scripts && python3 -m fatawa.build --all` → `python3 scripts/import_fatawa.py --all` (which ends by running `pnpm backfill:markdown` to fill `content.markdown_chars`; run it alone with `pnpm backfill:markdown [--all]`). Full details: `apps/api/docs/data-import-fatawa-razawiyyah.md`.
- Never modify or move files in `data-extracted/` (incl. `Images/`).

### Multi-book import rules (all books are re-imported; never break an earlier book)
- Every book has its own scripts: `seed_<book>.py`, `<book>/build.py` (package), `import_<book>.py`, and its own output folder `apps/api/scripts/out/<book-slug>/` (volume slugs like `1`,`2` repeat across books, so never write to a shared `out/<slug>/`).
- Scripts only touch their own book (look it up by `books.slug`; clean/delete scoped to that `bookId`).
- Reuse shared code (`fatawa/tei.py`, `fatawa/rtf_decode.py`, DB helpers in `seed_fatawa_razawiyyah.py`) only by **importing it unmodified**. If a new book needs different behaviour (format difference, new TextP codes, different page/TOC linkage) and changing a shared function could alter or misalign an earlier book's output, **copy the code into the new book's package and modify the copy** — never edit shared modules in a way that changes old output.
- After touching any shared module, rebuild the older books and confirm their `chapters.json` is unchanged.
- Bahar-e-Shariat (`data-extracted/02 Bahar e Shariyat/`): run from `apps/api`: `python3 scripts/seed_bahar_e_shariat.py` → `cd scripts && python3 -m bahar.build --all` → `python3 scripts/import_bahar.py --all`. Images: `apps/web/public/bahar-e-shariat/`. Details: `apps/api/docs/data-import-bahar-e-shariat.md`.
- Books 03-05 (Miraat-ul-Manajeeh, Faizan e Riaz ul Saliheen, Siraat ul Jinaan) share one config-driven pipeline in `apps/api/scripts/multibook/` (still scoped per book by `books.slug`, own `out/<slug>/`): `python3 scripts/import_all.py --book miraat|faizan|siraat`. Details: `apps/api/docs/data-import-multibook.md`.
