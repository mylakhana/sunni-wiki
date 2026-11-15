#!/usr/bin/env python3
"""Books 03-05 (Miraat-ul-Manajeeh, Faizan e Riaz ul Saliheen, Siraat ul Jinaan): legacy CSVs -> chapter tree + TEI JSON.

Usage (from apps/api/scripts):
    python3 -m multibook.build --book miraat --all
    python3 -m multibook.build --book siraat --volume 1 --volume 10
    python3 -m multibook.build --all-books [--dry-run]

Output: scripts/out/<book slug>/<vol>/chapters.json and scripts/out/<book slug>/report.json.

Same CSV family as Bahar-e-Shariat (no Map.csv; Index/Text PageNo share one numbering) with these differences:
  * TOC is a single tree "1.*" (Faizan vol 1: "1.*" = summary, "2.*" = detailed -> the highest root with children
    is used). Depth-1 nodes = chapters (own TEI); deeper nodes (any depth) = sub-topics (anchor in the chapter).
  * Faizan: top-level "حدیث نمبر" nodes that follow a "باب"/"کتاب" node are demoted to sub-topics of it
    (volumes mix both kinds at depth 1). Nodes without a page take the page of their first descendant.
  * Siraat/Faizan text = one RTF (`w`) blob per printed page (PageNo == row number); Miraat = h/u/a/r rows
    (+ a few RTF rows). RTF is converted per paragraph (multibook.rtf) so a chapter can start MID-page
    at its heading paragraph; the page's first paragraph is the fallback.
  * Row order is trusted (Miraat has typo'd PageNo values such as 5479/425 inside a volume): rows whose page
    breaks the monotone sequence get the previous page; only front matter (page <= 0, appended at the file end
    in Miraat vol 1) is moved to the front.
  * Index file order is arbitrary (Miraat) -> nodes are sorted by IndexNo.
Shared (imported unmodified): fatawa.tei (row -> TEI), fatawa.rtf_decode, bahar.build (_grams/_sim/_lnds helpers).
"""
import argparse
import csv
import html
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from urllib.parse import quote

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
from bahar.build import _grams, _lnds, _sim, idx_key  # noqa: E402
from fatawa import tei  # noqa: E402
from multibook import config, rtf  # noqa: E402

csv.field_size_limit(10**9)
SIM_HEAD, SIM_ANY = 0.5, 0.75
BLOCK_MIN = 8  # out-of-order run of >= this many rows = displaced block
BAB_RE = re.compile(r"^\s*(با\s*ب|کتاب|کِتَاب)")
HADITH_RE = re.compile(r"^\s*حد\s*یث")


def read_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def clean_title(s: str) -> str:
    lines = [re.sub(r"\s+", " ", re.sub(r"[\x00-\x08\x0e-\x1f]", "", l).replace("\xa0", " ")).strip() for l in s.splitlines()]
    return " - ".join(l for l in lines if l)[:500]


# ── TOC ──────────────────────────────────────────────────────────────────────
def build_toc(index_rows: list[dict], demote_hadith: bool, rep: dict) -> list[dict]:
    nodes, seen = [], set()
    for r in index_rows:
        no = r["IndexNo"].strip()
        if not re.fullmatch(r"\d+(\.\d+)*", no):
            if no:
                rep.setdefault("bad_index_no", []).append(no)
            continue
        if no in seen:
            rep["duplicate_index_no"].append(no)
            continue
        seen.add(no)
        pg = r["PageNo"].strip()
        title = clean_title(r["IndexText"])
        if not title and "." in no:  # junk rows (Siraat vol 6: title "\x01")
            rep.setdefault("empty_title_nodes", []).append(no)
            continue
        nodes.append({"no": no, "title": title, "page": int(pg) if pg.lstrip("-").isdigit() else None})
    roots = Counter(n["no"].split(".")[0] for n in nodes if "." in n["no"])
    root = max(roots, key=int) if roots else "1"
    nodes = [n for n in nodes if "." in n["no"] and n["no"].split(".")[0] == root]
    nodes.sort(key=lambda n: idx_key(n["no"]))
    rep["toc_root"] = root
    # pageless node -> page of its first descendant that has one
    for i, n in enumerate(nodes):
        if n["page"] is None:
            for m in nodes[i + 1:]:
                if not m["no"].startswith(n["no"] + "."):
                    break
                if m["page"] is not None:
                    n["page"], n["page_from_child"] = m["page"], True
                    break
    last_bab = None
    for n in nodes:
        parts = n["no"].split(".")
        depth = len(parts) - 1  # 1 = chapter
        n["parent"] = None
        n["level"] = 2
        if depth >= 2:
            n["level"] = 3
            n["parent"] = ".".join(parts[:2])
        if depth == 1:
            if demote_hadith and last_bab and HADITH_RE.match(n["title"]) and not BAB_RE.match(n["title"]):
                n["level"], n["parent"] = 3, last_bab
                rep["demoted_hadith"] = rep.get("demoted_hadith", 0) + 1
            elif BAB_RE.match(n["title"]):
                last_bab = n["no"]
        elif depth >= 2:
            top = next((m for m in nodes if m["no"] == ".".join(parts[:2])), None)
            if top and top["level"] == 3:  # parent was demoted -> follow it
                n["parent"] = top["parent"]
    return nodes


# ── text rows -> elements ────────────────────────────────────────────────────
def load_elements(folder: Path, rep: dict, media: bool = False) -> list[dict]:
    path = folder / "TextContainer.csv"
    raw = read_csv(path) if path.exists() else []
    rows = []
    remaps = Counter()
    for r in raw:
        pg_s = (r["PageNo"] or "").strip()
        page = int(pg_s) if pg_s.lstrip("-").isdigit() else 0
        code_raw = (r["TextP"] or "").strip().lower()
        text = r["Description"] or ""
        if code_raw == "i" and media:  # page image (bulk books): file lives in apps/web/public/media/
            rows.append({"page": page, "code": "i", "text": text})
            continue
        if text.lstrip().startswith("{\\rtf"):
            code = "w"
        else:
            code = code_raw if code_raw == "r" else tei.normalize_code(r["TextP"], text, remaps)
            if code == "w":  # labelled w but not RTF
                code = "u"
        rows.append({"page": page, "code": code, "text": text})
    # front matter (page <= 0) first, in page order; stable
    front = sorted((r for r in rows if r["page"] <= 0), key=lambda r: r["page"])
    body = [r for r in rows if r["page"] > 0]
    keep = _lnds([r["page"] for r in body])
    # Rows outside the longest in-order subsequence are either (a) a displaced BLOCK (Miraat vol 2: the pages 19-40 chapter
    # sits after pages 50-237 in the file) -> re-inserted by page as a unit, or (b) isolated PageNo typos (5479, 425) -> they
    # keep their file position and take the previous page.
    runs, cur = [], []
    for i, r in enumerate(body):
        if i in keep:
            if cur:
                runs.append(cur)
            cur = []
        else:
            cur.append(i)
    if cur:
        runs.append(cur)
    moved_idx = {i for run in runs if len(run) >= BLOCK_MIN for i in run}
    base = [r for i, r in enumerate(body) if i not in moved_idx]
    fixed, prev = 0, base[0]["page"] if base else 0
    kept_ids = {id(body[i]) for i in keep}
    for r in base:
        if id(r) in kept_ids:
            prev = r["page"]
        else:
            r["page_raw"], r["page"] = r["page"], prev
            fixed += 1
    for run in (r for r in runs if len(r) >= BLOCK_MIN):
        blk = [body[i] for i in run]
        pos = max((k for k, b in enumerate(base) if b["page"] <= blk[0]["page"]), default=-1) + 1
        base[pos:pos] = blk
    rep["blocks_moved"] = [(len(r), body[r[0]]["page"]) for r in runs if len(r) >= BLOCK_MIN]
    body = base
    rows = front + body
    rep.update(rows=len(rows), front_rows=len(front), pages_clamped=fixed, remaps=dict(remaps))
    elements = []
    for ri, r in enumerate(rows):
        if r["code"] == "i":
            xmls = [f'<figure><graphic url="{config.MEDIA_URL}/{tei.esc(quote(r["text"].strip().split("/")[-1].split(chr(92))[-1]))}"/></figure>']
        elif r["code"] == "w":
            xmls = rtf.rtf_to_tei(r["text"])
        elif r["code"] == "r":
            lines = [tei.clean(l) for l in re.split(r"[\r\n]+", r["text"]) if tei.clean(l)]
            xmls = [f'<quote type="verse" xml:lang="ur">{"<lb/>".join(tei.esc(re.sub(r"\s*\t\s*|\s{4,}", " ، ", l)) for l in lines)}</quote>'] if lines else []
        else:
            xmls = tei.row_to_tei(r["code"], r["text"])
        for x in xmls:
            elements.append({"page": r["page"], "xml": x, "text": html.unescape(re.sub(r"<[^>]+>", "", x)),
                             "head": x.startswith("<head"), "row": ri})
    rep["elements"] = len(elements)
    return elements


# ── placement ────────────────────────────────────────────────────────────────
def place(nodes: list[dict], els: list[dict]) -> dict[str, tuple[int, str]]:
    head_g = {i: _grams(e["text"]) for i, e in enumerate(els) if e["head"]}
    all_g: dict[int, set] = {}
    placed, cursor = {}, 0
    for n in nodes:
        pg = n["page"]
        if pg is None:
            continue
        on_page = [i for i in range(cursor, len(els)) if els[i]["page"] == pg]
        if on_page:
            tg = _grams(n["title"])
            best, best_s, how = None, SIM_HEAD, "heading"
            for i in on_page:
                if i in head_g:
                    s = _sim(tg, head_g[i])
                    if s > best_s:
                        best, best_s = i, s
            if best is None:
                best_s, how = SIM_ANY, "paragraph"
                for i in on_page:
                    if not els[i]["head"] and len(els[i]["text"]) < 400:
                        g = all_g.setdefault(i, _grams(els[i]["text"]))
                        s = _sim(tg, g)
                        if s > best_s:
                            best, best_s = i, s
            row, how = (best, how) if best is not None else (on_page[0], "page")
        else:
            row = next((i for i in range(cursor, len(els)) if els[i]["page"] > pg), None)
            how = "next"
            if row is None:
                continue
        placed[n["no"]] = (row, how)
        cursor = row
    return placed


def unit_tei(els, lo, hi, title, no, anchors, state) -> str:
    parts: list[str] = []
    if title and not (lo < hi and els[lo]["head"]):
        parts.append(f"<head>{tei.esc(title)}</head>")
    for i in range(lo, hi):
        e = els[i]
        parts.extend(anchors.get(i, []))
        if e["page"] != state["page"]:
            state["page"] = e["page"]
            if e["page"] > 0:
                parts.append(f'<pb n="{e["page"]}" ana="page-{e["page"]}"/>')
        parts.append(e["xml"])
        state["emitted"] += 1
    nattr = f' n="{tei.esc(no)}"' if no else ""
    kind = "chapter" if no else "front"
    return f'<div type="{kind}"{nattr}>{"".join(parts)}</div>'


def build_volume(book: str, slug: str, folder: Path, report: dict) -> list[dict]:
    cfg = config.BOOKS[book]
    rep = report["volumes"][slug] = {"duplicate_index_no": []}
    toc = build_toc(read_csv(folder / "IndexContainer.csv"), cfg["demote_hadith"], rep)
    els = load_elements(folder, rep, cfg.get("media", False))
    rep["toc_nodes"] = len(toc)
    out: list[dict] = []
    sib: Counter = Counter()

    def add(no, parent, title, level, xml=None, anchor=None, title_en=None):
        k = (parent, level == 3)
        out.append({"key": no, "parent": parent, "sort": sib[k], "slug": f"{slug}-{no}" if slug else no, "titleUr": title,
                    "titleEn": title_en, "level": level, "anchorId": anchor, "tei": xml})
        sib[k] += 1

    placed = place(toc, els)
    chapters = [n for n in toc if n["level"] == 2]
    starts: dict[int, str] = {}
    for n in chapters:
        if n["no"] in placed and placed[n["no"]][0] not in starts:
            starts[placed[n["no"]][0]] = n["no"]
    rep["chapter_collisions"] = [n["no"] for n in chapters if n["no"] in placed and starts.get(placed[n["no"]][0]) != n["no"]]
    if cfg.get("demote_collisions"):
        # bulk books: a TOC entry that lands on the same paragraph as an earlier chapter (finer-grained TOC than the
        # text can resolve) becomes a sub-topic (anchor) of the chapter that owns that paragraph, so nothing is lost.
        col = set(rep["chapter_collisions"])
        for n in chapters:
            if n["no"] in col:
                n["level"], n["parent"] = 3, None
        rep["chapters_demoted"] = len(col)
        chapters = [n for n in chapters if n["no"] not in col]
    rep["chapters_unplaced"] = [n["no"] for n in chapters if n["no"] not in placed]
    order = sorted(starts)
    ends = dict(zip(order, order[1:] + [len(els)]))
    first = order[0] if order else len(els)

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
            sub_row[n["no"]] = placed[n["no"]][0]
            anchors.setdefault(placed[n["no"]][0], []).append(f'<anchor xml:id="s-{tei.esc(n["no"])}"/>')
    rep.update(placed=dict(Counter(h for _, h in placed.values())), chapters=len(chapters),
               subtopics=sum(n["level"] == 3 for n in toc),
               subtopics_dropped=[n["no"] for n in toc if n["level"] == 3 and n["no"] not in placed][:50])

    state = {"emitted": 0, "page": None}
    has_front = first > 0 and any(e["text"].strip() for e in els[:first])
    if has_front:
        add("front", None, None, 2, unit_tei(els, 0, first, None, None, anchors, state), title_en="Front matter")
    for n in chapters:
        row = placed.get(n["no"], (None,))[0]
        xml = unit_tei(els, row, ends[row], n["title"], n["no"], anchors, state) if row is not None and starts.get(row) == n["no"] else None
        add(n["no"], None, n["title"], 2, xml)
    for n in toc:
        if n["level"] != 3 or n["no"] not in sub_row:
            continue
        ch = chapter_of_row(sub_row[n["no"]]) or ("front" if has_front else None)
        if ch is None:
            continue
        add(n["no"], ch, n["title"], 3, anchor=f's-{n["no"]}')
    rep["elements_emitted"] = state["emitted"]
    rep["parity_ok"] = state["emitted"] == len(els)

    bad = []
    for c in out:
        if c["tei"]:
            try:
                ET.fromstring(f'<r xmlns="http://www.tei-c.org/ns/1.0" xmlns:xml="http://www.w3.org/XML/1998/namespace">{c["tei"]}</r>')
            except ET.ParseError as e:
                bad.append(f'{c["key"]}: {e}')
    rep["xml_errors"], rep["xml_error_count"] = bad[:20], len(bad)
    return out


def build_book(book: str, wanted: list[str] | None, dry: bool, data_root: Path = config.DATA_ROOT) -> None:
    folders = config.volume_folders(book, data_root)
    report = {"volumes": {}}
    od = config.out_dir(book)
    for slug in wanted or config.volume_slugs(book):
        chapters = build_volume(book, slug, folders[slug], report)
        r = report["volumes"][slug]
        print(f'{book}:{slug or '-':>3} elements {r["elements"]:>6} parity={r["parity_ok"]} toc {r["toc_nodes"]:>4} chapters {r["chapters"]:>3} '
              f'subs {r["subtopics"]:>4} placed {r["placed"]} unplaced_ch {len(r["chapters_unplaced"])} '
              f'collisions {len(r["chapter_collisions"])} dropped_sub {len(r["subtopics_dropped"])} clamped {r["pages_clamped"]} xml_err {r["xml_error_count"]}')
        if not dry:
            d = od / (slug or "_")
            d.mkdir(parents=True, exist_ok=True)
            (d / "chapters.json").write_text(json.dumps(chapters, ensure_ascii=False), encoding="utf-8")
    if not dry:
        (od / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--book", choices=list(config.BOOKS), action="append", default=[])
    ap.add_argument("--all-books", action="store_true")
    ap.add_argument("--all", action="store_true", help="all volumes of --book")
    ap.add_argument("--volume", action="append", default=[])
    ap.add_argument("--data-root", type=Path, default=config.DATA_ROOT)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if a.all_books:
        for b in config.BOOKS:
            build_book(b, None, a.dry_run, a.data_root)
        return
    if not a.book or not (a.all or a.volume):
        ap.error("pass --all-books, or --book with --all/--volume")
    for b in a.book:
        build_book(b, None if a.all else a.volume, a.dry_run, a.data_root)


if __name__ == "__main__":
    main()
