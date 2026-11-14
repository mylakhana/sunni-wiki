#!/usr/bin/env python3
"""Export / import titles of level=1 chapters (booklets) as JSON.

Run from apps/api:

    python3 scripts/chapters_titles_sync.py --mode export   # writes scripts/chapters_level1.json
    python3 scripts/chapters_titles_sync.py --mode fix      # export -> fix JSON -> import, in one go
    python3 scripts/chapters_titles_sync.py --mode import   # updates titleEn/titleUr/titleAr by id

Fix mode runs export, then rewrites the JSON, then imports it, with no manual step. It splits titleUr, e.g.
    "رسالہ اطائب الصیب علٰی ارض الطیب ( تقلید کے ضروری ہونے کا ثبوت)"
into titleAr = text before "(" without the leading "رسالہ"/"رسالۃ", and titleUr = text inside
the brackets (a missing closing bracket is tolerated). titleEn is left untouched. Titles without
brackets only get titleAr (titleUr is kept). Rows whose titleAr is already set (in the DB)
are skipped, so re-running is safe.

Import only UPDATEs existing rows (matched by id); it never inserts or deletes.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_fatawa_razawiyyah import connect, load_database_url  # noqa: E402

FILE = Path(__file__).resolve().parent / "chapters_level1.json"


def export(conn) -> None:
    with conn.cursor() as cur:
        cur.execute("SELECT id, volumeId, titleUr, titleEn, titleAr FROM chapters WHERE level=1 ORDER BY id")
        rows = [
            {"id": r[0], "volumeId": r[1], "titleUr": r[2], "titleEn": r[3], "titleAr": r[4]}
            for r in cur.fetchall()
        ]
    FILE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"exported {len(rows)} chapters -> {FILE}")


def fix() -> None:
    if not FILE.exists():
        sys.exit(f"missing {FILE}: run with --mode export first")
    rows = json.loads(FILE.read_text(encoding="utf-8"))
    changed = skipped = 0
    for r in rows:
        src = (r.get("titleUr") or "").strip()
        if not src or r.get("titleAr"):
            skipped += 1
            continue
        head, sep, inner = src.partition("(")
        head = re.sub(r"^رسالہ|^رسالۃ", "", head.strip()).strip()
        r["titleAr"] = head
        if sep:
            r["titleUr"] = inner.strip().removesuffix(")").strip()
        changed += 1
    FILE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"fixed {changed} chapters, skipped {skipped} -> {FILE}")


def import_(conn) -> None:
    if not FILE.exists():
        sys.exit(f"missing {FILE}: run with --mode export first")
    rows = json.loads(FILE.read_text(encoding="utf-8"))
    updated = missing = 0
    with conn.cursor() as cur:
        for r in rows:
            cur.execute(
                "UPDATE chapters SET titleEn=%s, titleUr=%s, titleAr=%s WHERE id=%s",
                (r.get("titleEn"), r.get("titleUr"), r.get("titleAr"), r["id"]),
            )
            cur.execute("SELECT 1 FROM chapters WHERE id=%s", (r["id"],))
            if cur.fetchone():
                updated += 1
            else:
                missing += 1
    conn.commit()
    print(f"processed {updated} chapters, {missing} ids not found (skipped)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["export", "fix", "import"], required=True)
    a = ap.parse_args()
    conn = connect(load_database_url())
    try:
        if a.mode == "fix":
            export(conn)
            fix()
            import_(conn)
        elif a.mode == "export":
            export(conn)
        else:
            import_(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
