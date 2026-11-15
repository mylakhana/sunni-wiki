#!/usr/bin/env python3
"""Import the converted chapters of books 03-05 (scripts/out/<book slug>/<vol>/chapters.json) into the DB.

Run from apps/api, after `python3 scripts/seed_books.py` and `cd scripts && python3 -m multibook.build`:
    python3 scripts/import_books.py --all-books
    python3 scripts/import_books.py --book siraat --volume 3 --volume 10

Touches ONLY the selected book's volumes (books.slug): chapters (+ content) of the selected volumes are deleted,
then re-inserted; volumes are kept (created by the seed). Ends with `pnpm backfill:markdown` (fills
content.markdown_chars where NULL; other books untouched).
"""
import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from multibook import config  # noqa: E402
from seed_fatawa_razawiyyah import connect, load_database_url  # noqa: E402  (generic DB helpers only)


def import_book(conn, book: str, wanted: list[str]) -> None:
    out = config.out_dir(book)
    for s in wanted:
        if not (out / (s or "_") / "chapters.json").exists():
            sys.exit(f"{book}: missing output for volume {s}: run `python3 -m multibook.build --book {book} --all` first")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM books WHERE slug=%s", (config.BOOKS[book]["book"]["slug"],))
        row = cur.fetchone()
        if not row:
            sys.exit(f"{book}: book not found — run seed_books.py first")
        book_id = row[0]
        for slug in wanted:
            vol_id = None  # volume-less book (config volumes=None): chapters.volumeId stays NULL
            if slug:
                cur.execute("SELECT id FROM volumes WHERE bookId=%s AND slug=%s", (book_id, slug))
                vrow = cur.fetchone()
                if not vrow:
                    sys.exit(f"{book}: volume {slug} missing — run seed_books.py first")
                vol_id = vrow[0]
                scope, arg = "ch.volumeId", vol_id
            else:
                scope, arg = "ch.bookId", book_id
            cur.execute(f"DELETE c FROM content c JOIN chapters ch ON ch.id=c.chapterId WHERE {scope}=%s", (arg,))
            cur.execute(f"UPDATE chapters ch SET parentId=NULL WHERE {scope}=%s", (arg,))
            cur.execute(f"DELETE ch FROM chapters ch WHERE {scope}=%s", (arg,))
            chapters = json.loads((out / (slug or "_") / "chapters.json").read_text(encoding="utf-8"))
            ids: dict[str, int] = {}
            n_content = 0
            for c in chapters:  # parents always precede children
                parent_id = ids.get(c["parent"]) if c["parent"] else None
                cur.execute(
                    "INSERT INTO chapters (bookId, volumeId, parentId, sort, level, anchorId, slug, titleEn, titleUr) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (book_id, vol_id, parent_id, c["sort"], c.get("level", 2), c.get("anchorId"),
                     c["slug"], c.get("titleEn"), c.get("titleUr")),
                )
                ids[c["key"]] = cur.lastrowid
                if c["tei"]:
                    cur.execute("INSERT INTO content (chapterId, slug, tei, version, updatedAt) VALUES (%s,'default',%s,1,%s)",
                                (cur.lastrowid, c["tei"], now))
                    n_content += 1
            if vol_id:
                cur.execute("UPDATE volumes SET status=%s WHERE id=%s", ("active" if n_content else "inactive", vol_id))
            conn.commit()
            print(f"{book} vol {slug or '-':>3}: {len(chapters)} chapters, {n_content} with content")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--book", action="append", choices=list(config.BOOKS), default=[])
    ap.add_argument("--all-books", action="store_true")
    ap.add_argument("--all", action="store_true", help="all volumes of the selected book(s)")
    ap.add_argument("--volume", action="append", default=[])
    ap.add_argument("--no-backfill", action="store_true")
    a = ap.parse_args()
    books = list(config.BOOKS) if a.all_books else a.book
    if not books or not (a.all_books or a.all or a.volume):
        ap.error("pass --all-books, or --book with --all/--volume")
    conn = connect(load_database_url())
    try:
        for b in books:
            import_book(conn, b, config.volume_slugs(b) if (a.all or a.all_books) else a.volume)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    if not a.no_backfill:
        subprocess.run(["pnpm", "backfill:markdown"], cwd=Path(__file__).resolve().parent.parent, check=True)


if __name__ == "__main__":
    main()
