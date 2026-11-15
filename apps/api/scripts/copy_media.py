#!/usr/bin/env python3
"""Copy data-extracted/bulk-addition/Images/ -> apps/web/public/media/ (idempotent; source is never modified).

Bulk books reference page images as /media/<file name> (see multibook.config.MEDIA_URL). Run from apps/api:
    python3 scripts/copy_media.py
"""
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from multibook import config  # noqa: E402

SRC = config.DATA_ROOT / config.BULK_DIR / "Images"
DST = config.API_DIR.parent / "web" / "public" / "media"


def main() -> None:
    if not SRC.is_dir():
        sys.exit(f"missing {SRC}")
    DST.mkdir(parents=True, exist_ok=True)
    n = 0
    for f in SRC.iterdir():
        if f.is_file() and not f.name.startswith("."):
            shutil.copy2(f, DST / f.name)
            n += 1
    print(f"media: {n} files -> {DST}")


if __name__ == "__main__":
    main()
