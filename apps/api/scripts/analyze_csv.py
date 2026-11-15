#!/usr/bin/env python3
"""Analyze the legacy CSV volumes of one or more books (read-only, no DB).

Run (from apps/api/scripts):
    python3 analyze_csv.py                                  # miraat, faizan, siraat
    python3 analyze_csv.py --dir "../../../../data-extracted/05 Siraat ul Jinaan"

Per volume: header/encoding/BOM, row counts, TextP codes, PageNo range + out-of-order rows, RTF (`w`) rows,
DataOrder usage, IndexNo depth/prefixes, duplicate IndexNo, index pages not present in the text, empty
descriptions. Prints a table; findings are summarised in README.md.
"""
import argparse
import csv
import re
from collections import Counter
from pathlib import Path

csv.field_size_limit(10**9)
DATA = Path(__file__).resolve().parents[3].parent / "data-extracted"
BOOK_DIRS = ["03 Miraat-ul-Manajeh", "04 Faizan e Riaz ul Saliheen", "05 Siraat ul Jinaan"]


def read(path: Path):
    raw = path.read_bytes()
    bom = raw.startswith(b"\xef\xbb\xbf")
    with open(path, encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        return r.fieldnames, list(r), bom


def analyze_volume(folder: Path) -> dict:
    out = {"name": folder.name}
    ih, irows, ibom = read(folder / "IndexContainer.csv")
    out["index_cols"], out["index_rows"], out["bom"] = ih, len(irows), ibom
    pref, depth, seen, dup, badno = Counter(), Counter(), set(), 0, 0
    ipages = []
    for r in irows:
        no = r["IndexNo"].strip()
        if not re.fullmatch(r"\d+(\.\d+)*", no):
            badno += 1
            continue
        pref[no.split(".")[0]] += 1
        depth[no.count(".")] += 1
        dup += no in seen
        seen.add(no)
        p = r["PageNo"].strip()
        if p.lstrip("-").isdigit():
            ipages.append(int(p))
    out.update(index_roots=dict(pref), index_depth=dict(sorted(depth.items())), index_dup=dup, index_badno=badno,
               index_nopage=sum(1 for r in irows if not r["PageNo"].strip()))
    # index: order vs numbering, pages monotonic?
    nos = [tuple(int(x) for x in r["IndexNo"].split(".")) for r in irows if re.fullmatch(r"\d+(\.\d+)*", r["IndexNo"].strip())]
    out["index_file_sorted"] = nos == sorted(nos)
    tp = folder / "TextContainer.csv"
    if not tp.exists():
        out["text"] = None
        return out
    th, trows, tbom = read(tp)
    out["text_cols"], out["text_rows"] = th, len(trows)
    codes = Counter((r["TextP"] or "").strip() for r in trows)
    out["codes"] = dict(codes.most_common())
    pages, bad = [], 0
    for r in trows:
        p = (r["PageNo"] or "").strip()
        if p.lstrip("-").isdigit():
            pages.append(int(p))
        else:
            bad += 1
    out["page_range"] = (min(pages), max(pages)) if pages else None
    out["page_bad"] = bad
    out["page_out_of_order"] = sum(1 for a, b in zip(pages, pages[1:]) if b < a)
    out["rtf_rows"] = sum(1 for r in trows if (r["Description"] or "").lstrip().startswith("{\\rtf"))
    out["empty_desc"] = sum(1 for r in trows if not (r["Description"] or "").strip())
    out["dataorder_filled"] = sum(1 for r in trows if (r["DataOrder"] or "").strip())
    out["align"] = dict(Counter((r["Alignment"] or "").strip() for r in trows).most_common(6))
    out["img_rows"] = sum(1 for r in trows if (r["TextP"] or "").strip() == "i")
    tpages = set(pages)
    out["index_pages_missing_in_text"] = sum(1 for p in set(ipages) if p not in tpages and p > 0)
    out["index_page_range"] = (min(ipages), max(ipages)) if ipages else None
    sn = [int(r["SNo"]) for r in trows if (r["SNo"] or "").strip().isdigit()]
    out["sno_dup"] = len(sn) - len(set(sn))
    out["sno_sorted"] = sn == sorted(sn)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dir", action="append", type=Path, help="book dir (repeatable); default = books 03-05")
    a = ap.parse_args()
    for book in a.dir or [DATA / d for d in BOOK_DIRS]:
        print(f"\n######## {book.name}")
        for vf in sorted((p for p in book.iterdir() if p.is_dir()), key=lambda p: [int(x) if x.isdigit() else x for x in re.split(r"(\d+)", p.name)]):
            r = analyze_volume(vf)
            print(f"\n== {vf.name!r}")
            for k, v in r.items():
                if k != "name":
                    print(f"   {k}: {v}")
        extra = [p.name for p in book.iterdir() if not p.is_dir()]
        if extra:
            print("non-volume entries:", extra)


if __name__ == "__main__":
    main()
