#!/usr/bin/env python3
"""Bahar-e-Shariat: legacy CSVs -> chapter tree + TEI fragments (JSON per volume).

Usage (from apps/api/scripts):
    python3 -m bahar.build --all              # all 21 volumes (1..19, 19z, 20)
    python3 -m bahar.build --volume 3 --volume 19z
    python3 -m bahar.build --all --dry-run    # report only, write nothing

Output: scripts/out/bahar-e-shariat/<slug>/chapters.json and scripts/out/bahar-e-shariat/report.json
(a book-specific folder: Fatawa's out/<slug>/ uses the same "1","2".. slugs and must never be overwritten).

Format differences vs Fatawa (why this is its own builder, not a flag on fatawa.build):
  * No Map.csv. PageNo in TextContainer and IndexContainer are the SAME numbering (the printed page of the
    whole book, continuous across volumes; <=0 = front matter), so a TOC node maps to rows by PageNo directly.
  * IndexContainer holds two trees: "1" / "1.NN" = summary TOC (ignored), "2" / "2.NN" / "2.NN.MM" = detailed
    TOC (used). 2.NN -> chapter (owns TEI), 2.NN.MM -> sub-topic (anchor inside its chapter).
  * No fatwa "مسئلہ N" units, no booklets/groups. TextP additionally has `r` (Persian/Urdu verse), the image
    rows (`i`) hold a path like "Takhreej/Images/<file>"; Alignment `c`/`l` and DataOrder are ignored.
  * Volume 1 has no TextContainer.csv: its TOC is imported as empty chapters (no content).
Shared with Fatawa without modification: fatawa.tei (row -> TEI, incl. RTF `w` rows via fatawa.rtf_decode).
"""
import argparse
import csv
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from urllib.parse import quote

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
from fatawa import tei  # noqa: E402  (shared, read-only use)
from seed_bahar_e_shariat import DEFAULT_DATA_DIR, check_data_dir, sort_key, volume_slugs  # noqa: E402

OUT_DIR = SCRIPTS / "out" / "bahar-e-shariat"
IMAGE_URL_PREFIX = "/bahar-e-shariat"  # apps/web/public/bahar-e-shariat/ = copy of data-extracted Images/
csv.field_size_limit(10**9)
SIM_MIN = 0.5


def read_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def idx_key(no: str) -> tuple:
    return tuple(int(p) if p.isdigit() else 0 for p in no.split("."))


def clean_title(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()[:500]


# ── TOC (detailed tree "2.*" only) ───────────────────────────────────────────
def build_toc(index_rows: list[dict], rep: dict) -> list[dict]:
    seen, nodes = set(), []
    for r in index_rows:
        no = r["IndexNo"].strip()
        if not re.fullmatch(r"\d+(\.\d+)*", no):
            if no:
                rep.setdefault("bad_index_no", []).append(no)
            continue
        if "." not in no or no.split(".")[0] != "2":  # "1"/"2" = TOC titles, "1.NN" = summary TOC
            continue
        if no in seen:
            rep["duplicate_index_no"].append(no)
            continue
        seen.add(no)
        pg = r["PageNo"].strip()
        nodes.append({"no": no, "title": clean_title(r["IndexText"]), "page": int(pg) if pg.lstrip("-").isdigit() else None})
    nodes.sort(key=lambda n: idx_key(n["no"]))
    by_no = {n["no"]: n for n in nodes}
    for n in nodes:
        parts = n["no"].split(".")
        n["parent"] = next((".".join(parts[:k]) for k in range(len(parts) - 1, 1, -1) if ".".join(parts[:k]) in by_no), None)
        n["level"] = 2 if n["parent"] is None else 3
    return nodes


# ── row order repair ─────────────────────────────────────────────────────────
def _lnds(vals: list[int]) -> set[int]:
    """Indexes of one longest non-decreasing subsequence of `vals` (the rows that are in page order)."""
    import bisect
    tails: list[int] = []   # tails[k] = index of the smallest tail of a subsequence of length k+1
    prev = [-1] * len(vals)
    for i, v in enumerate(vals):
        k = bisect.bisect_right([vals[t] for t in tails], v)
        prev[i] = tails[k - 1] if k else -1
        if k == len(tails):
            tails.append(i)
        else:
            tails[k] = i
    keep, i = set(), tails[-1] if tails else -1
    while i != -1:
        keep.add(i)
        i = prev[i]
    return keep


def repair_order(rows: list[dict], rep: dict) -> list[dict]:
    """The export appends displaced rows at the end of a volume file (title page, front matter, stray
    paragraphs/images of earlier pages). Put them back: front matter (page <= 0) first, title page leading;
    displaced body rows are re-inserted by page (and by DataOrder when both sides have it)."""
    front = [r for r in rows if r["page"] <= 0]
    body = [r for r in rows if r["page"] > 0]
    title = [r for r in front if r["code"] == "a" and "تسہیل" in r["text"]]
    front = title + sorted((r for r in front if r not in title), key=lambda r: r["page"])  # stable
    keep = _lnds([r["page"] for r in body])
    base = [r for i, r in enumerate(body) if i in keep]
    moved = [r for i, r in enumerate(body) if i not in keep]
    for r in moved:
        pos = None
        if r["do"] is not None:
            pos = next((k for k, b in enumerate(base) if b["page"] == r["page"] and b["do"] is not None and b["do"] > r["do"]), None)
        if pos is None:
            pos = max((k for k, b in enumerate(base) if b["page"] <= r["page"]), default=-1) + 1
        base.insert(pos, r)
    rep["front_rows"], rep["displaced_body_rows"] = len(front), len(moved)
    return front + base


# ── placement ────────────────────────────────────────────────────────────────
def _grams(s: str) -> set[str]:
    t = re.sub(r"[^\w]|\d|_", "", tei.strip_marks(s))
    return {t[i:i + 3] for i in range(len(t) - 2)} or ({t} if t else set())


def _sim(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return max(inter / len(a | b), inter / min(len(a), len(b)) * 0.9)


def place(nodes: list[dict], rows: list[dict]) -> dict[str, tuple[int, str]]:
    """node no -> (row index, how). Index order = reading order; the row cursor never moves backwards.
    how: 'heading' (title matches a heading row on the page) | 'page' (first row of the page) | 'next' (page absent: next page)."""
    head_grams = {i: _grams(r["text"]) for i, r in enumerate(rows) if r["code"] in ("h", "hc")}
    placed, cursor = {}, 0
    for n in nodes:
        pg = n["page"]
        if pg is None:
            continue
        on_page = [i for i in range(cursor, len(rows)) if rows[i]["page"] == pg]
        if on_page:
            tg = _grams(n["title"])
            best, best_s = None, SIM_MIN
            for i in on_page:
                if i in head_grams:
                    s = _sim(tg, head_grams[i])
                    if s > best_s:
                        best, best_s = i, s
            row, how = (best, "heading") if best is not None else (on_page[0], "page")
        else:
            row = next((i for i in range(cursor, len(rows)) if rows[i]["page"] > pg), None)
            how = "next"
            if row is None:
                continue
        placed[n["no"]] = (row, how)
        cursor = row
    return placed


# ── TEI ──────────────────────────────────────────────────────────────────────
def row_tei(code: str, text: str, images: dict[str, str], rep: dict) -> list[str]:
    if code == "i":
        base = re.split(r"[\\/]", text.strip())[-1]
        real = images.get(base.lower())
        if real is None:
            rep.setdefault("missing_images", []).append(base)
            real = base
        return [f'<figure><graphic url="{IMAGE_URL_PREFIX}/{tei.esc(quote(real))}"/></figure>']
    if code == "r":  # verse: one source line per verse line
        lines = [tei.clean(l) for l in re.split(r"[\r\n]+", text) if tei.clean(l)]
        if not lines:
            return []
        return [f'<quote type="verse" xml:lang="ur">{"<lb/>".join(tei.esc(re.sub(r"\s*\t\s*|\s{4,}", " ، ", l)) for l in lines)}</quote>']
    return tei.row_to_tei(code, text)


def unit_tei(rows, lo, hi, title, kind, n, anchors, state, images, rep) -> str:
    parts: list[str] = []
    if title and not (lo < hi and rows[lo]["code"] in ("h", "hc")):
        parts.append(f"<head>{tei.esc(title)}</head>")
    for i in range(lo, hi):
        r = rows[i]
        parts.extend(anchors.get(i, []))
        if r["page"] != state["page"]:
            state["page"] = r["page"]
            if r["page"] > 0:
                parts.append(f'<pb n="{r["page"]}" ana="page-{r["page"]}"/>')
        parts.extend(row_tei(r["code"], r["text"], images, rep))
        state["emitted"] += 1
    nattr = f' n="{tei.esc(n)}"' if n else ""
    return f'<div type="{kind}"{nattr}>{"".join(parts)}</div>'


def build_volume(slug: str, folder: Path, images: dict[str, str], report: dict) -> list[dict]:
    rep = report["volumes"][slug] = {"remaps": Counter(), "duplicate_index_no": []}
    toc = build_toc(read_csv(folder / "IndexContainer.csv"), rep)
    text_path = folder / "TextContainer.csv"
    text_rows = read_csv(text_path) if text_path.exists() else []
    rep["has_text"] = bool(text_rows)
    rows = []
    for r in text_rows:
        pg = int(r["PageNo"]) if (r["PageNo"] or "").strip().lstrip("-").isdigit() else 0
        raw = (r["TextP"] or "").strip().lower()
        code = raw if raw == "r" else tei.normalize_code(r["TextP"], r["Description"], rep["remaps"])
        do = (r["DataOrder"] or "").strip()
        rows.append({"page": pg, "code": code, "text": r["Description"], "do": int(do) if do.isdigit() else None})
    rows = repair_order(rows, rep)
    rep["rows"], rep["toc_nodes"] = len(rows), len(toc)
    if not toc:
        rep["warning"] = "no detailed TOC (2.*) found"

    out: list[dict] = []
    sib: Counter = Counter()

    def add(key, parent, title, level, xml=None, anchor=None, title_en=None):
        k = (parent, level == 3)
        out.append({"key": key, "parent": parent, "sort": sib[k], "slug": f"{slug}-{key}", "titleUr": title,
                    "titleEn": title_en, "level": level, "anchorId": anchor, "tei": xml})
        sib[k] += 1

    if not rows:  # no text for this volume (vol 1): TOC only, every entry an empty chapter
        for n in toc:
            add(n["no"], n["parent"], n["title"], 2)
        rep.update(chapters=len(toc), subtopics=0, rows_parity_ok=True, xml_error_count=0, rows_emitted=0)
        return out

    placed = place(toc, rows)
    chapters = [n for n in toc if n["level"] == 2]
    starts: dict[int, str] = {}  # row -> chapter no (first chapter wins a shared row)
    for n in chapters:
        if n["no"] in placed and placed[n["no"]][0] not in starts:
            starts[placed[n["no"]][0]] = n["no"]
    rep["chapter_collisions"] = [n["no"] for n in chapters if n["no"] in placed and starts.get(placed[n["no"]][0]) != n["no"]]
    rep["chapters_unplaced"] = [n["no"] for n in chapters if n["no"] not in placed]
    order = sorted(starts)
    ends = dict(zip(order, order[1:] + [len(rows)]))
    first = order[0] if order else len(rows)

    def chapter_of_row(row: int) -> str | None:
        cur = None
        for st in order:
            if st <= row:
                cur = starts[st]
            else:
                break
        return cur

    anchors: dict[int, list[str]] = {}
    sub_row: dict[str, int] = {}
    for n in toc:
        if n["level"] == 3 and n["no"] in placed:
            row = placed[n["no"]][0]
            sub_row[n["no"]] = row
            anchors.setdefault(row, []).append(f'<anchor xml:id="s-{tei.esc(n["no"])}"/>')
    hows = Counter(h for _, h in placed.values())
    rep.update(placed=dict(hows), subtopics_dropped=[n["no"] for n in toc if n["level"] == 3 and n["no"] not in placed][:50],
               chapters=len(chapters), subtopics=sum(n["level"] == 3 for n in toc))

    state = {"emitted": 0, "page": None}
    has_front = first > 0 and any(r["text"].strip() for r in rows[:first])
    if has_front:
        anchors_front = anchors
        add("front", None, None, 2, unit_tei(rows, 0, first, None, "front", None, anchors_front, state, images, rep), title_en="Front matter")
    for n in chapters:
        row = placed.get(n["no"], (None,))[0]
        xml = None
        if row is not None and starts.get(row) == n["no"]:
            xml = unit_tei(rows, row, ends[row], n["title"], "chapter", n["no"], anchors, state, images, rep)
        add(n["no"], None, n["title"], 2, xml)
    for n in toc:
        if n["level"] != 3 or n["no"] not in sub_row:
            continue
        ch = chapter_of_row(sub_row[n["no"]]) or ("front" if has_front else None)
        if ch is None:
            continue
        add(n["no"], ch, n["title"], 3, anchor=f's-{n["no"]}')
    rep["rows_emitted"] = state["emitted"]
    rep["rows_parity_ok"] = state["emitted"] == len(rows)

    bad = []
    for c in out:
        if c["tei"]:
            try:
                ET.fromstring(f'<r xmlns="http://www.tei-c.org/ns/1.0" xmlns:xml="http://www.w3.org/XML/1998/namespace">{c["tei"]}</r>')
            except ET.ParseError as e:
                bad.append(f'{c["key"]}: {e}')
    rep["xml_errors"], rep["xml_error_count"] = bad[:20], len(bad)
    rep["remaps"] = dict(rep["remaps"])
    return out


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
    folders = check_data_dir(a.data_dir)
    images = {p.name.lower(): p.name for p in (a.data_dir / "Images").iterdir() if not p.name.startswith(".")}
    report = {"volumes": {}}
    for slug in sorted(wanted, key=sort_key):
        chapters = build_volume(slug, folders[slug], images, report)
        r = report["volumes"][slug]
        print(f'{slug:>3}: rows {r["rows"]:>5} parity={r["rows_parity_ok"]} toc {r["toc_nodes"]:>4} chapters {r["chapters"]:>3} '
              f'subtopics {r["subtopics"]:>4} placed {r.get("placed", {})} unplaced_ch {len(r.get("chapters_unplaced", []))} '
              f'collisions {len(r.get("chapter_collisions", []))} dropped_sub {len(r.get("subtopics_dropped", []))} xml_err {r["xml_error_count"]}')
        if not a.dry_run:
            d = OUT_DIR / slug
            d.mkdir(parents=True, exist_ok=True)
            (d / "chapters.json").write_text(json.dumps(chapters, ensure_ascii=False), encoding="utf-8")
    if not a.dry_run:
        (OUT_DIR / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
