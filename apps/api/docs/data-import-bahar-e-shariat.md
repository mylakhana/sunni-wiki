# Data import — Bahar-e-Shariat

Run (from `apps/api`): `python3 scripts/seed_bahar_e_shariat.py` → `cd scripts && python3 -m bahar.build --all` → `python3 scripts/import_bahar.py --all`.
Then (content search): `pnpm search:reindex --book <book-slug>` (from `apps/api`, OpenSearch running) — rebuilds this book's content-search index (see `apps/api/docs/search-index.md`).
Build report: `scripts/out/bahar-e-shariat/report.json` (row parity, placement stats, dropped/unplaced entries).
Result: 21 volumes, 4443 chapters (383 with content). Volume 1 has no text in the source (TOC only).
See `scripts/README.md` for format differences and handled defects.
Status: `import_bahar.py` sets `volumes.status = inactive` for any volume without content (vol 1); the API hides inactive volumes/chapters (`src/services/status.ts`).
