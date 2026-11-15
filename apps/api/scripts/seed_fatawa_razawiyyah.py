#!/usr/bin/env python3
"""Create the basic Fatawa Razawiyyah entries: Author, Category, Book, 31 Volumes.

Run (from apps/api):  python3 scripts/seed_fatawa_razawiyyah.py [--data-dir DIR] [--dry-run]

Behaviour (per CLAUDE.md "Data import"):
  * Cleans all previous data of THIS book first (content -> chapters -> volumes),
    then re-inserts, so every run gives the same result.
  * Author / Category / Book are upserted by slug (ids stay stable).
  * Volumes are derived from the folder names of the extracted data:
        "jild 1.1A" -> 1a, "jild 1.2B" -> 1b, "jild N" -> N  (N = 2..30)
WARNING: the clean step deletes imported chapters/content of this book; re-run
import_fatawa.py afterwards. The book is created with published=1.
Reads DATABASE_URL from apps/api/.env (or the environment). Needs `pymysql`.
"""
import argparse
from datetime import datetime, timezone
import os
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

import pymysql

API_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = API_DIR.parents[2] / "data-extracted" / "01 Fatawa Razaviyya"

AUTHOR = dict(
    slug="imam-ahmed-raza-khan",
    nameEn="Alahazrat Imam Ahmed Raza Khan",
    nameAr="الإمام أحمد رضا خان",
    nameUr="اعلیٰ حضرت امام احمد رضا خان",
    birthYear=1856,
    deathYear=1921,
    # AI persona prompt (kept in its own file; upserted with the author)
    prompt=(Path(__file__).parent / "prompts" / "imam-ahmed-raza-khan.md").read_text(encoding="utf-8").strip(),
)
CATEGORY = dict(slug="fatawa", titleEn="Fatawa", titleAr="فتاوى", titleUr="فتاویٰ", sort=0)
BOOK = dict(
    slug="fatawa-razawiyya",
    titleEn="Fatawa Razawiyyah",
    titleAr="الفتاوى الرضوية",
    titleUr="فتاویٰ رضویہ",
    languages='["ar","ur"]',
    published=1,
)


def folder_to_slug(name: str) -> str | None:
    """'jild 1.1A' -> '1a', 'jild 1.2B' -> '1b', 'jild 12' -> '12'."""
    m = re.fullmatch(r"jild (\d+)(?:\.\d+([AB]))?", name)
    if not m:
        return None
    return (m.group(1) + (m.group(2) or "")).lower()


def volume_slugs() -> list[str]:
    """Canonical list: 1a, 1b, 2 .. 30 (31 volumes)."""
    return ["1a", "1b"] + [str(n) for n in range(2, 31)]


def sort_key(slug: str) -> tuple[int, str]:
    m = re.fullmatch(r"(\d+)([ab]?)", slug)
    return int(m.group(1)), m.group(2)


def load_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    env_file = API_DIR / ".env"
    if not url and env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not url:
        sys.exit("DATABASE_URL not found (env or apps/api/.env)")
    return url


def connect(url: str):
    u = urlparse(url)
    return pymysql.connect(
        host=u.hostname or "localhost",
        port=u.port or 3306,
        user=unquote(u.username or ""),
        password=unquote(u.password or ""),
        database=u.path.lstrip("/"),
        charset="utf8mb4",
        autocommit=False,
    )


def check_data_dir(data_dir: Path) -> None:
    """Folders must map 1:1 onto the 31 expected volume slugs."""
    if not (data_dir / "Images").is_dir():
        sys.exit(f"Images/ folder missing in {data_dir}")
    found = {}
    for p in data_dir.iterdir():
        if p.is_dir() and p.name.startswith("jild"):
            slug = folder_to_slug(p.name)
            if slug is None:
                sys.exit(f"Unrecognised volume folder: {p.name!r}")
            found[slug] = p.name
    if sorted(found, key=sort_key) != volume_slugs():
        missing = set(volume_slugs()) - set(found)
        extra = set(found) - set(volume_slugs())
        sys.exit(f"Volume folders do not match expected 31 (missing={missing}, extra={extra})")


def upsert(cur, table: str, key: str, row: dict) -> int:
    cols = list(row)
    placeholders = ", ".join(["%s"] * len(cols))
    updates = ", ".join(f"`{c}`=VALUES(`{c}`)" for c in cols if c != key)
    cur.execute(
        f"INSERT INTO `{table}` ({', '.join(f'`{c}`' for c in cols)}) "
        f"VALUES ({placeholders}) ON DUPLICATE KEY UPDATE {updates}",
        [row[c] for c in cols],
    )
    cur.execute(f"SELECT id FROM `{table}` WHERE `{key}`=%s", (row[key],))
    return cur.fetchone()[0]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    ap.add_argument("--dry-run", action="store_true", help="validate folders only, no DB writes")
    args = ap.parse_args()

    check_data_dir(args.data_dir)
    slugs = volume_slugs()
    print(f"Data dir OK: {len(slugs)} volume folders map to slugs {slugs[0]}..{slugs[-1]}")
    if args.dry_run:
        return

    conn = connect(load_database_url())
    try:
        with conn.cursor() as cur:
            author_id = upsert(cur, "authors", "slug", AUTHOR)
            category_id = upsert(cur, "categories", "slug", CATEGORY)
            book_id = upsert(cur, "books", "slug", {**BOOK, "authorId": author_id, "categoryId": category_id, "updatedAt": datetime.now(timezone.utc).replace(tzinfo=None)})

            # Clean previous data of this book (FK order; content cascades from chapters).
            cur.execute("DELETE c FROM content c JOIN chapters ch ON ch.id=c.chapterId WHERE ch.bookId=%s", (book_id,))
            cur.execute("UPDATE chapters SET parentId=NULL WHERE bookId=%s", (book_id,))
            cur.execute("DELETE FROM chapters WHERE bookId=%s", (book_id,))
            cur.execute("DELETE FROM volumes WHERE bookId=%s", (book_id,))

            for i, slug in enumerate(slugs, start=1):
                num, part = sort_key(slug)
                label = f"{num}{part.upper()}"
                cur.execute(
                    "INSERT INTO volumes (bookId, slug, sort, titleEn, titleUr) VALUES (%s,%s,%s,%s,%s)",
                    (book_id, slug, i, f"Volume {label}", f"جلد {label}"),
                )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    print(f"Done: author#{author_id} category#{category_id} book#{book_id} + {len(slugs)} volumes")


if __name__ == "__main__":
    main()
