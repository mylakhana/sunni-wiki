#!/usr/bin/env python3
"""Import the converted Fatawa Radawiyyah chapters (scripts/out/<vol>/chapters.json) into the DB.

Run from apps/api, after `python3 scripts/seed_fatawa_razawiyyah.py` and
`cd scripts && python3 -m fatawa.build --all`:

    python3 scripts/import_fatawa.py --all
    python3 scripts/import_fatawa.py --volume 10 --volume 1a

Cleans previous data first: all chapters (+ content, via FK cascade/explicit delete)
of the selected volumes are deleted, then re-inserted. Volumes themselves are kept
(created by the seed script). Finally runs `pnpm backfill:markdown`
(scripts/backfill-markdown-chars.ts) to fill content.markdown_chars.
"""
import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_fatawa_razawiyyah import BOOK, connect, load_database_url, sort_key, volume_slugs  # noqa: E402

OUT_DIR = Path(__file__).resolve().parent / "out"


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
            sys.exit(f"missing output for volume {s}: run `python3 -m fatawa.build` first")

    conn = connect(load_database_url())
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM books WHERE slug=%s", (BOOK["slug"],))
            row = cur.fetchone()
            if not row:
                sys.exit("book not found — run seed_fatawa_razawiyyah.py first")
            book_id = row[0]
            for slug in sorted(wanted, key=sort_key):
                cur.execute("SELECT id FROM volumes WHERE bookId=%s AND slug=%s", (book_id, slug))
                vrow = cur.fetchone()
                if not vrow:
                    sys.exit(f"volume {slug} missing — run seed_fatawa_razawiyyah.py first")
                vol_id = vrow[0]
                # clean previous data of this volume
                cur.execute("DELETE c FROM content c JOIN chapters ch ON ch.id=c.chapterId WHERE ch.volumeId=%s", (vol_id,))
                cur.execute("UPDATE chapters SET parentId=NULL WHERE volumeId=%s", (vol_id,))
                cur.execute("DELETE FROM chapters WHERE volumeId=%s", (vol_id,))

                chapters = json.loads((OUT_DIR / slug / "chapters.json").read_text(encoding="utf-8"))
                ids: dict[str, int] = {}
                n_content = 0
                for c in chapters:  # books/chapters first, sub-topics last: parents always precede children
                    parent_id = ids.get(c["parent"]) if c["parent"] else None
                    cur.execute(
                        "INSERT INTO chapters (bookId, volumeId, parentId, sort, level, anchorId, slug, titleEn, titleUr) "
                        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                        (book_id, vol_id, parent_id, c["sort"], c.get("level", 1), c.get("anchorId"),
                         c["slug"], c.get("titleEn"), c.get("titleUr")),
                    )
                    ids[c["key"]] = cur.lastrowid
                    if c["tei"]:
                        cur.execute(
                            "INSERT INTO content (chapterId, slug, tei, version, updatedAt) VALUES (%s,'default',%s,1,%s)",
                            (cur.lastrowid, c["tei"], now),
                        )
                        n_content += 1
                conn.commit()
                print(f"vol {slug:>3}: {len(chapters)} chapters, {n_content} with content")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    # Fill content.markdown_chars (exact Ask-AI sizes) for the freshly inserted rows (NULL until then).
    subprocess.run(
        ["pnpm", "backfill:markdown"],
        cwd=Path(__file__).resolve().parent.parent,
        check=True,
    )


if __name__ == "__main__":
    main()
