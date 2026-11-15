#!/usr/bin/env python3
"""Create the basic Bahar-e-Shariat entries: Author, Category, Book, 21 Volumes.

Run (from apps/api):  python3 scripts/seed_bahar_e_shariat.py [--data-dir DIR] [--dry-run]

Same behaviour as seed_fatawa_razawiyyah.py, for THIS book only (it never touches other books):
  * Cleans all previous data of THIS book first (content -> chapters -> volumes), then re-inserts.
  * Author / Category / Book are upserted by slug (ids stay stable).
  * Volumes come from the folder names of the extracted data:
        "Bahaar-e-Shareeat-N" -> N (1..20),  "Bahaar-e-Shareeat-19 (Zameema)" -> 19z
Only generic DB helpers (connect / load_database_url / upsert) are shared with the Fatawa seed.
"""
import argparse
from datetime import datetime, timezone
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_fatawa_razawiyyah import API_DIR, connect, load_database_url, upsert  # noqa: E402

DEFAULT_DATA_DIR = API_DIR.parents[2] / "data-extracted" / "02 Bahar e Shariyat"

AUTHOR = dict(
    slug="sadrushariyah-mufti-amjad-ali-aazmi",
    nameEn="Sadrushariyah Mufti Amjad Ali Aazmi",
    nameAr="مفتي أمجد علي الأعظمي",
    nameUr="مفتی امجد علی اعظمی",
)
CATEGORY = dict(slug="fiqh", titleEn="Fiqh", titleAr="الفقه", titleUr="فقہ", sort=1)
BOOK = dict(
    slug="bahar-e-shariat",
    titleEn="Bahar-e-Shariat",
    titleAr="بهار شريعت",
    titleUr="بہارِ شریعت",
    languages='["ur"]',
    published=1,
)


def folder_to_slug(name: str) -> str | None:
    """'Bahaar-e-Shareeat-7' -> '7', 'Bahaar-e-Shareeat-19 (Zameema)' -> '19z'."""
    m = re.fullmatch(r"Bahaar-e-Shareeat-(\d+)( \(Zameema\))?", name)
    if not m:
        return None
    return m.group(1) + ("z" if m.group(2) else "")


def sort_key(slug: str) -> tuple[int, str]:
    m = re.fullmatch(r"(\d+)(z?)", slug)
    return int(m.group(1)), m.group(2)


def volume_slugs() -> list[str]:
    return [str(n) for n in range(1, 20)] + ["19z", "20"]


def volume_titles(slug: str) -> tuple[str, str]:
    num, z = sort_key(slug)
    if z:
        return f"Volume {num} (Zameema)", f"حصہ {num} (ضمیمہ)"
    return f"Volume {num}", f"حصہ {num}"


def check_data_dir(data_dir: Path) -> dict[str, Path]:
    if not (data_dir / "Images").is_dir():
        sys.exit(f"Images/ folder missing in {data_dir}")
    found = {}
    for p in data_dir.iterdir():
        if p.is_dir() and p.name.startswith("Bahaar"):
            slug = folder_to_slug(p.name)
            if slug is None:
                sys.exit(f"Unrecognised volume folder: {p.name!r}")
            found[slug] = p
    if sorted(found, key=sort_key) != volume_slugs():
        sys.exit(f"Volume folders do not match expected 21 (missing={set(volume_slugs()) - set(found)}, extra={set(found) - set(volume_slugs())})")
    return found


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    ap.add_argument("--dry-run", action="store_true", help="validate folders only, no DB writes")
    args = ap.parse_args()

    check_data_dir(args.data_dir)
    slugs = volume_slugs()
    print(f"Data dir OK: {len(slugs)} volume folders -> slugs {slugs}")
    if args.dry_run:
        return

    conn = connect(load_database_url())
    try:
        with conn.cursor() as cur:
            author_id = upsert(cur, "authors", "slug", AUTHOR)
            category_id = upsert(cur, "categories", "slug", CATEGORY)
            book_id = upsert(cur, "books", "slug", {**BOOK, "authorId": author_id, "categoryId": category_id,
                                                    "updatedAt": datetime.now(timezone.utc).replace(tzinfo=None)})
            # Clean previous data of THIS book only (FK order; content cascades from chapters).
            cur.execute("DELETE c FROM content c JOIN chapters ch ON ch.id=c.chapterId WHERE ch.bookId=%s", (book_id,))
            cur.execute("UPDATE chapters SET parentId=NULL WHERE bookId=%s", (book_id,))
            cur.execute("DELETE FROM chapters WHERE bookId=%s", (book_id,))
            cur.execute("DELETE FROM volumes WHERE bookId=%s", (book_id,))
            for i, slug in enumerate(slugs, start=1):
                en, ur = volume_titles(slug)
                cur.execute("INSERT INTO volumes (bookId, slug, sort, titleEn, titleUr) VALUES (%s,%s,%s,%s,%s)",
                            (book_id, slug, i, en, ur))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    print(f"Done: author#{author_id} category#{category_id} book#{book_id} + {len(slugs)} volumes")


if __name__ == "__main__":
    main()
