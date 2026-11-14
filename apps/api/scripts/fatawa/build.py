#!/usr/bin/env python3
"""Fatawa Razawiyyah: legacy CSVs -> chapter tree + TEI fragments (JSON per volume).

Usage (from apps/api/scripts):
    python3 -m fatawa.build --all              # all 31 volumes
    python3 -m fatawa.build --volume 10 --volume 1a
    python3 -m fatawa.build --all --dry-run    # report only, write nothing

Output: scripts/out/<slug>/chapters.json  and  scripts/out/report.json  (git-ignored).

How the CSVs are linked (see scripts/README.md):
  * TextContainer rows are in reading order; PageNo = digital page chunk.
  * IndexContainer is the TOC (dotted IndexNo). Map gives IndexNo -> digital PageNo
    and PageNo -> printed BookPageNo. A TOC leaf therefore only points at a *page*;
    inside that page we place it on the k-th "start candidate" row (heading or
    "مسئلہ N" question). A leaf's text runs until the next placed leaf. Leaves that
    cannot be placed keep an empty chapter and are listed in the report.
"""
import argparse
import csv
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

from . import tei

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
from seed_fatawa_razawiyyah import DEFAULT_DATA_DIR, folder_to_slug, sort_key, volume_slugs  # noqa: E402

OUT_DIR = SCRIPTS / "out"
csv.field_size_limit(10**9)
_D = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "0123456789" * 2)


def read_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def idx_key(no: str) -> tuple:
    return tuple(int(p) if p.isdigit() else 0 for p in no.split("."))


def norm_book_page(s: str) -> str:
    return re.sub(r"\s*-\s*", "-", (s or "").strip())


# ── TOC ──────────────────────────────────────────────────────────────────────
def build_toc(index_rows: list[dict], report: dict) -> list[dict]:
    seen, nodes = set(), []
    for r in index_rows:
        no = r["IndexNo"].strip()
        if not no:
            continue
        if no in seen:
            report["duplicate_index_no"].append(no)
            continue
        seen.add(no)
        title = clean_title(r["IndexText"])
        if "." not in no and "فہرست" in title:
            continue  # the TOC's own title ("فہرست مضامین مفصل")
        nodes.append({"no": no, "title": title})
    nodes.sort(key=lambda n: idx_key(n["no"]))
    by_no = {n["no"]: n for n in nodes}
    for n in nodes:
        parts = n["no"].split(".")
        n["parent"] = None
        for k in range(len(parts) - 1, 0, -1):  # nearest existing ancestor
            cand = ".".join(parts[:k])
            if cand in by_no:
                n["parent"] = cand
                break
        n["children"] = []
    for n in nodes:
        if n["parent"]:
            by_no[n["parent"]]["children"].append(n["no"])
    return nodes


def clean_title(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace(" ", " ")).strip()[:500]


# ── start candidates & placement ─────────────────────────────────────────────
def find_candidates(rows: list[dict]) -> list[int]:
    """Row indexes where a new unit may begin (heading and/or question row).
    Adjacent candidates (heading directly followed by heading/question) merge into the first."""
    raw = [i for i, r in enumerate(rows)
           if r["code"] in ("h", "hc") or tei.is_masala_start(r["code"], r["text"])]
    out, prev = [], -5
    for i in raw:
        if not (i == prev + 1 and rows[prev]["code"] in ("h", "hc")):
            out.append(i)
        prev = i
    return out


def place_leaves(leaves: list[dict], rows: list[dict], cands: list[int], idx_page: dict) -> dict:
    """leaf no -> start row index (only for leaves we could place)."""
    placed, cursor = {}, -1
    for lf in leaves:
        page = idx_page.get(lf["no"])
        if page is None:
            continue
        for c in cands:
            if c > cursor and rows[c]["page"] == page:
                placed[lf["no"]] = c
                cursor = c
                break
    return placed


# ── TEI assembly ─────────────────────────────────────────────────────────────
def unit_tei(rows: list[dict], lo: int, hi: int, title: str | None, kind: str, n: str | None,
             page_book: dict, state: dict, anchors: dict) -> str:
    parts: list[str] = []
    qs = as_ = None
    for i in range(lo, hi):
        r = rows[i]
        if qs is None and tei.is_masala_start(r["code"], r["text"]):
            qs = len(parts)
        if qs is not None and as_ is None and r["code"] in ("u", "uc") and tei.is_answer_start(r["text"]):
            as_ = len(parts)
        pb = ""
        if r["page"] != state.get("page"):
            state["page"] = r["page"]
            bp = page_book.get(r["page"])
            if bp is None and r["page"]:
                state["unmapped_pages"].add(r["page"])
            pb = f'<pb n="{tei.esc(bp or "")}" ana="digital-{r["page"]}"/>' if r["page"] else ""
        els = tei.row_to_tei(r["code"], r["text"])
        state["emitted"] += 1
        if pb:
            els = [pb] + els
        els = anchors.get(i, []) + els
        parts.extend(els)
    # question/answer wrapping on top-level elements (pb markers stay inside)
    body = parts
    if qs is not None and as_ is not None:
        body = parts[:qs] + ['<ab type="question">'] + parts[qs:as_] + ["</ab>", '<ab type="answer">'] + parts[as_:] + ["</ab>"]
    nattr = f' n="{tei.esc(n)}"' if n else ""
    t = f"<head>{tei.esc(title)}</head>" if title else ""
    return f'<div type="{kind}"{nattr}>{t}{"".join(body)}</div>'


def build_volume(slug: str, folder: Path, report: dict) -> list[dict]:
    rep = report["volumes"][slug] = {"remaps": Counter(), "duplicate_index_no": []}
    text_rows = read_csv(folder / "TextContainer.csv")
    toc = build_toc(read_csv(folder / "IndexContainer.csv"), rep)
    map_rows = read_csv(folder / "Map.csv")

    page_book: dict[int, str] = {}
    idx_page: dict[str, int] = {}
    for m in map_rows:
        try:
            pg = int(m["PageNo"])
        except ValueError:
            continue
        bp = norm_book_page(m["BookPageNo"])
        if bp:
            if pg in page_book and page_book[pg] != bp:
                rep.setdefault("conflicting_book_pages", []).append(f"{pg}: {page_book[pg]} vs {bp}")
            else:
                page_book[pg] = bp
        if m["IndexNo"].strip():
            idx_page[m["IndexNo"].strip()] = pg

    rows = []
    for r in text_rows:
        pg = int(r["PageNo"]) if (r["PageNo"] or "").strip().isdigit() else 0
        code = tei.normalize_code(r["TextP"], r["Description"], rep["remaps"])
        rows.append({"sno": r["SNo"], "page": pg, "code": code, "text": r["Description"]})
    rep["rows"] = len(rows)
    rep["pages_not_in_map"] = sorted({r["page"] for r in rows if r["page"] and r["page"] not in page_book})

    leaves = [n for n in toc if not n["children"]]
    cands = find_candidates(rows)
    # TOC order is not always page order (e.g. vol 23) -> place in reading (page) order.
    by_page = lambda n: (idx_page.get(n["no"], 10**9), idx_key(n["no"]))
    placed = place_leaves(sorted(leaves, key=by_page), rows, cands, idx_page)
    rep.update(toc_nodes=len(toc), leaves=len(leaves), placed=len(placed),
               unplaced=[n["no"] for n in leaves if n["no"] not in placed][:50],
               unplaced_count=len(leaves) - len(placed), candidates=len(cands))

    # Keep placed leaves + their ancestors as chapters. Every other TOC node
    # becomes an invisible <index> anchor at its page (title is preserved, no empty chapters).
    by_no = {n["no"]: n for n in toc}
    keep = set(placed)
    for no in list(placed):
        p = by_no[no]["parent"]
        while p and p not in keep:
            keep.add(p)
            p = by_no[p]["parent"]
    anchors: dict[int, list[str]] = {}
    last_start, no_page = -1, 0
    for n in sorted(toc, key=by_page):  # reading order
        if n["no"] in placed:
            last_start = placed[n["no"]]
        if n["no"] in keep:
            continue
        pg = idx_page.get(n["no"])
        row = next((i for i in range(last_start + 1 if last_start >= 0 else 0, len(rows)) if rows[i]["page"] == pg), None) if pg else None
        if row is None and pg:  # page numbers reset inside this volume: first row on that page
            row = next((i for i in range(len(rows)) if rows[i]["page"] == pg), None)
        if row is None:
            no_page += 1
            continue
        anchors.setdefault(row, []).append(
            f'<index indexName="toc" n="{tei.esc(n["no"])}"><term>{tei.esc(n["title"])}</term></index>')
    rep["toc_anchors"] = sum(len(v) for v in anchors.values())
    rep["toc_dropped_no_page"] = no_page

    starts = sorted(placed.values())
    state = {"emitted": 0, "page": None, "unmapped_pages": set()}
    chapters: list[dict] = []
    sibling_sort: Counter = Counter()

    def add(key, parent, title, tei_xml):
        s = sibling_sort[parent]
        sibling_sort[parent] += 1
        chapters.append({"key": key, "parent": parent, "sort": s, "slug": f"{slug}-{key}",
                         "titleUr": title, "tei": tei_xml})

    first = starts[0] if starts else len(rows)
    if first > 0 or not starts:
        add("front", None, None, unit_tei(rows, 0, first, None, "front", None, page_book, state, anchors))
        chapters[-1]["titleEn"] = "Front matter"
    end_of = dict(zip(starts, starts[1:] + [len(rows)]))
    for n in toc:
        if n["no"] not in keep:
            continue
        lo = placed.get(n["no"])
        xml = None
        if lo is not None:
            xml = unit_tei(rows, lo, end_of[lo], n["title"], "fatwa", n["no"], page_book, state, anchors)
        parent = n["parent"]
        while parent and parent not in keep:
            parent = by_no[parent]["parent"]
        add(n["no"], parent, n["title"], xml)
    rep["rows_emitted"] = state["emitted"]
    rep["rows_parity_ok"] = state["emitted"] == len(rows)
    rep["pages_not_in_map_emitted"] = sorted(state["unmapped_pages"])

    # well-formedness
    bad = []
    for c in chapters:
        if c["tei"]:
            try:
                ET.fromstring(f'<r xmlns="http://www.tei-c.org/ns/1.0">{c["tei"]}</r>')
            except ET.ParseError as e:
                bad.append(f'{c["key"]}: {e}')
    rep["xml_errors"] = bad[:20]
    rep["xml_error_count"] = len(bad)
    rep["remaps"] = dict(rep["remaps"])
    return chapters


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--volume", action="append", default=[])
    ap.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    wanted = volume_slugs() if a.all else [v.lower() for v in a.volume]
    if not wanted:
        ap.error("pass --all or --volume")
    folders = {folder_to_slug(p.name): p for p in a.data_dir.iterdir() if p.is_dir() and p.name.startswith("jild")}
    report = {"volumes": {}}
    for slug in sorted(wanted, key=sort_key):
        chapters = build_volume(slug, folders[slug], report)
        r = report["volumes"][slug]
        print(f'{slug:>3}: rows {r["rows"]:>5} parity={r["rows_parity_ok"]} toc {r["toc_nodes"]:>4} '
              f'leaves {r["leaves"]:>4} placed {r["placed"]:>4} anchors {r["toc_anchors"]:>4} xml_err {r["xml_error_count"]}')
        if not a.dry_run:
            d = OUT_DIR / slug
            d.mkdir(parents=True, exist_ok=True)
            (d / "chapters.json").write_text(json.dumps(chapters, ensure_ascii=False), encoding="utf-8")
    if not a.dry_run:
        OUT_DIR.mkdir(exist_ok=True)
        (OUT_DIR / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
