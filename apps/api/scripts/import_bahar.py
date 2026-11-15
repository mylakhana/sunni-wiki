#!/usr/bin/env python3
"""Import the converted Bahar-e-Shariat chapters (scripts/out/bahar-e-shariat/<vol>/chapters.json) into the DB.

Run from apps/api, after `python3 scripts/seed_bahar_e_shariat.py` and `cd scripts && python3 -m bahar.build --all`:

    python3 scripts/import_bahar.py --all
    python3 scripts/import_bahar.py --volume 3 --volume 19z

Touches ONLY this book's volumes (looked up by books.slug): chapters (+ content) of the selected volumes are
deleted, then re-inserted. Volumes are kept (created by the seed). Finally runs `pnpm backfill:markdown`
(fills content.markdown_chars where NULL, i.e. this fresh data; other books are untouched).
"""
import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_bahar_e_shariat import BOOK, sort_key, volume_slugs  # noqa: E402
from seed_fatawa_razawiyyah import connect, load_database_url  # noqa: E402  (generic DB helpers only)

OUT_DIR = Path(__file__).resolve().parent / "out" / "bahar-e-shariat"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--volume", action="append", default=[])
    a = ap.parse_args()
    wanted = volume_slugs() if a.all else [v.lower() for v in a.volume]
    if not wanted:
        ap.error("pass --all or --volume")
    for s in wanted:
        if not (OUT_DIR / s / "chapters.json").exists():
            sys.exit(f"missing output for volume {s}: run `python3 -m bahar.build` first")

    conn = connect(load_database_url())
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM books WHERE slug=%s", (BOOK["slug"],))
            row = cur.fetchone()
            if not row:
                sys.exit("book not found — run seed_bahar_e_shariat.py first")
            book_id = row[0]
            for slug in sorted(wanted, key=sort_key):
                cur.execute("SELECT id FROM volumes WHERE bookId=%s AND slug=%s", (book_id, slug))
                vrow = cur.fetchone()
                if not vrow:
                    sys.exit(f"volume {slug} missing — run seed_bahar_e_shariat.py first")
                vol_id = vrow[0]
                cur.execute("DELETE c FROM content c JOIN chapters ch ON ch.id=c.chapterId WHERE ch.volumeId=%s", (vol_id,))
                cur.execute("UPDATE chapters SET parentId=NULL WHERE volumeId=%s", (vol_id,))
                cur.execute("DELETE FROM chapters WHERE volumeId=%s", (vol_id,))

                chapters = json.loads((OUT_DIR / slug / "chapters.json").read_text(encoding="utf-8"))
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
                        cur.execute(
                            "INSERT INTO content (chapterId, slug, tei, version, updatedAt) VALUES (%s,'default',%s,1,%s)",
                            (cur.lastrowid, c["tei"], now),
                        )
                        n_content += 1
                # A volume with no text at all (vol 1: the source has no TextContainer.csv) is hidden by the API.
                status = "active" if n_content else "inactive"
                cur.execute("UPDATE volumes SET status=%s WHERE id=%s", (status, vol_id))
                conn.commit()
                print(f"vol {slug:>3}: {len(chapters)} chapters, {n_content} with content -> {status}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    subprocess.run(["pnpm", "backfill:markdown"], cwd=Path(__file__).resolve().parent.parent, check=True)


if __name__ == "__main__":
    main()
