# Pending prototypes

## Pending
| Page / route | Created | Prototype parts |
|---|---|---|
| In-book search (reader) | 2026-11-14 | Full-text search was removed; only a chapter-title filter exists. Real search needs a server-side index (derived from TEI). |
| TEI images in chapters | 2026-11-14 | `Images/…` paths show a placeholder; images not hosted. |

## Completed
| Page / route | Made dynamic | What was wired | Plan |
|---|---|---|---|
| `/` , `/browse`, `/authors`, `/authors/[slug]`, `/books/[slug]`, `/books/[slug]/[chapter]`, command palette | 2026-11-14 | Real API data (books, authors, categories, volumes, chapters, TEI text), per-instance cache, one-chapter reader | `docs/plans/dynamic-web.md` |
