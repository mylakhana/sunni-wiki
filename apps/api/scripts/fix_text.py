#!/usr/bin/env python3
"""Post-import text fixes for `content.tei`. Run after conversion + import are done.

Each fix is an exact-match (old -> new) replacement; nothing else is touched.

    python3 scripts/fix_text.py            # dry run: report counts only
    python3 scripts/fix_text.py --apply    # write changes
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_fatawa_razawiyyah import connect, load_database_url  # noqa: E402

# (name, exact old string, new string). Add new fixes here.
FIXES = [
    (
        "bismillah-stray-ta",
        "بسم اﷲ الرحمن الرحیمط۔ ",
        "بسم اﷲ الرحمن الرحیم ط۔ ",
    ),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    args = ap.parse_args()

    conn = connect(load_database_url())
    try:
        with conn.cursor() as cur:
            for name, old, new in FIXES:
                # LIKE is collation-lenient (may ignore diacritics), so confirm with an exact Python check.
                cur.execute("SELECT id, tei FROM content WHERE tei LIKE %s", (f"%{old}%",))
                hits = [(i, t) for i, t in cur.fetchall() if old in t]
                occurrences = sum(t.count(old) for _, t in hits)
                print(f"[{name}] rows={len(hits)} occurrences={occurrences}")
                if args.apply:
                    for i, t in hits:
                        cur.execute("UPDATE content SET tei=%s WHERE id=%s", (t.replace(old, new), i))
        if args.apply:
            conn.commit()
            print("applied.")
        else:
            conn.rollback()
            print("dry run — re-run with --apply to write.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
