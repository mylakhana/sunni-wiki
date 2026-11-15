#!/usr/bin/env python3
"""Seed Author / Category / Book / Volumes for books 03-05 (miraat, faizan, siraat).

Run (from apps/api):
    python3 scripts/seed_books.py --all-books
    python3 scripts/seed_books.py --book faizan [--dry-run]

Per book (never touches another book): upserts Author / Category / Book by slug, then cleans THIS book's
content -> chapters -> volumes and re-inserts its volumes (`Volume N` / `جلد N`). Volume list = config.BOOKS[..]["volumes"]
(Faizan has no volume 4 in the extracted data). Config (names, slugs, Faizan description): scripts/multibook/config.py.
"""
import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from multibook import config  # noqa: E402
from seed_fatawa_razawiyyah import connect, load_database_url, upsert  # noqa: E402  (generic DB helpers only)


def seed_book(conn, book: str) -> None:
    cfg = config.BOOKS[book]
    with conn.cursor() as cur:
        author_id = upsert(cur, "authors", "slug", cfg["author"])
        category_id = upsert(cur, "categories", "slug", config.CATEGORIES[cfg["category"]])
        book_id = upsert(cur, "books", "slug", {**cfg["book"], "authorId": author_id, "categoryId": category_id,
                                                "updatedAt": datetime.now(timezone.utc).replace(tzinfo=None)})
        cur.execute("DELETE c FROM content c JOIN chapters ch ON ch.id=c.chapterId WHERE ch.bookId=%s", (book_id,))
        cur.execute("UPDATE chapters SET parentId=NULL WHERE bookId=%s", (book_id,))
        cur.execute("DELETE FROM chapters WHERE bookId=%s", (book_id,))
        cur.execute("DELETE FROM volumes WHERE bookId=%s", (book_id,))
        for i, n in enumerate(cfg["volumes"], start=1):
            cur.execute("INSERT INTO volumes (bookId, slug, sort, titleEn, titleUr) VALUES (%s,%s,%s,%s,%s)",
                        (book_id, str(n), i, f"Volume {n}", f"جلد {n}"))
    conn.commit()
    print(f"{book}: author#{author_id} category#{category_id} book#{book_id} + {len(cfg['volumes'])} volumes")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--book", action="append", choices=list(config.BOOKS), default=[])
    ap.add_argument("--all-books", action="store_true")
    ap.add_argument("--data-root", type=Path, default=config.DATA_ROOT)
    ap.add_argument("--dry-run", action="store_true", help="validate folders only, no DB writes")
    a = ap.parse_args()
    books = list(config.BOOKS) if a.all_books else a.book
    if not books:
        ap.error("pass --all-books or --book")
    for b in books:
        folders = config.volume_folders(b, a.data_root)
        print(f"{b}: data dir OK, volumes {list(folders)}")
    if a.dry_run:
        return
    conn = connect(load_database_url())
    try:
        for b in books:
            seed_book(conn, b)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
