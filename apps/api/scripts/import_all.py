#!/usr/bin/env python3
"""Re-import every book from scratch with one command (DB must already be migrated).

Run (from apps/api):
    python3 scripts/import_all.py                    # all books
    python3 scripts/import_all.py --book bahar       # only one: fatawa | bahar | miraat | faizan | siraat | dalail | bulk
    python3 scripts/import_all.py --skip-seed        # skip the "pnpm db:seed" step

Steps per book: seed (scoped clean + volumes) -> build (CSV -> TEI JSON) -> import (DB).
Then, once after all books: chapters_titles_sync.py --mode fix.
Stops at the first failing step. To add a book, append a BOOKS entry (see CLAUDE.md multi-book rules).
"""
import argparse
import subprocess
import sys
import time
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
API = SCRIPTS.parent
PY = sys.executable

BOOKS = {
    "fatawa": [
        ([PY, "scripts/seed_fatawa_razawiyyah.py"], API),
        ([PY, "-m", "fatawa.build", "--all"], SCRIPTS),
        ([PY, "scripts/import_fatawa.py", "--all"], API),
    ],
    "bahar": [
        ([PY, "scripts/seed_bahar_e_shariat.py"], API),
        ([PY, "-m", "bahar.build", "--all"], SCRIPTS),
        ([PY, "scripts/import_bahar.py", "--all"], API),
    ],
    # books 03-05: generic multibook pipeline (scripts/multibook/), one entry per book
    "miraat": [
        ([PY, "scripts/seed_books.py", "--book", "miraat"], API),
        ([PY, "-m", "multibook.build", "--book", "miraat", "--all"], SCRIPTS),
        ([PY, "scripts/import_books.py", "--book", "miraat", "--all"], API),
    ],
    "faizan": [
        ([PY, "scripts/seed_books.py", "--book", "faizan"], API),
        ([PY, "-m", "multibook.build", "--book", "faizan", "--all"], SCRIPTS),
        ([PY, "scripts/import_books.py", "--book", "faizan", "--all"], API),
    ],
    "siraat": [
        ([PY, "scripts/seed_books.py", "--book", "siraat"], API),
        ([PY, "-m", "multibook.build", "--book", "siraat", "--all"], SCRIPTS),
        ([PY, "scripts/import_books.py", "--book", "siraat", "--all"], API),
    ],
    # book 06: volume-less (config volumes=None)
    "dalail": [
        ([PY, "scripts/seed_books.py", "--book", "dalail"], API),
        ([PY, "-m", "multibook.build", "--book", "dalail", "--all"], SCRIPTS),
        ([PY, "scripts/import_books.py", "--book", "dalail", "--all"], API),
    ],
}


# books of data-extracted/bulk-addition/ (all by Imam Ahmed Raza Khan, volume-less, share one Images/ -> web/public/media)
sys.path.insert(0, str(SCRIPTS))
from multibook import config as _cfg  # noqa: E402

_BULK_FLAGS = [f for k in _cfg.BULK_KEYS for f in ("--book", k)]
BOOKS["bulk"] = [
    ([PY, "scripts/copy_media.py"], API),
    ([PY, "scripts/seed_books.py", *_BULK_FLAGS], API),  # needs the Fatawa seed first (author imam-ahmed-raza-khan)
    ([PY, "-m", "multibook.build", *_BULK_FLAGS, "--all"], SCRIPTS),
    ([PY, "scripts/import_books.py", *_BULK_FLAGS, "--all"], API),
]


def run(cmd: list[str], cwd: Path) -> None:
    print(f"\n$ {' '.join(cmd[1:] if cmd[0] == PY else cmd)}   (in {cwd.name}/)", flush=True)
    t = time.time()
    if subprocess.run(cmd, cwd=cwd).returncode:
        sys.exit(f"FAILED: {' '.join(cmd)}")
    print(f"  ok ({time.time() - t:.0f}s)", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--book", action="append", choices=list(BOOKS), help="repeatable; default = all")
    ap.add_argument("--skip-seed", action="store_true", help="do not run `pnpm db:seed`")
    a = ap.parse_args()
    if not a.skip_seed:
        import json
        if "db:seed" in json.loads((API / "package.json").read_text()).get("scripts", {}):
            run(["pnpm", "db:seed"], API)
        else:
            print("(no `db:seed` script in package.json, skipping)")
    for book in a.book or list(BOOKS):
        print(f"\n=== {book} ===")
        for cmd, cwd in BOOKS[book]:
            run(cmd, cwd)
    # Last, after every book: split booklet titles + "Front matter" -> "مقدمہ" (idempotent, all books)
    print("\n=== titles ===")
    run([PY, "scripts/chapters_titles_sync.py", "--mode", "fix"], API)
    print("\nAll done.")


if __name__ == "__main__":
    main()
