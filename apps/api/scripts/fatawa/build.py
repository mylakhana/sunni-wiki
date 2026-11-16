#!/usr/bin/env python3
"""Fatawa Radawiyyah: legacy CSVs -> chapter tree + TEI fragments (JSON per volume).

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
        if not re.fullmatch(r"\d+(\.\d+)*", no):  # data defect (e.g. vol 27 has a row numbered "ز")
            report.setdefault("bad_index_no", []).append(f'{no!r}: {clean_title(r["IndexText"])[:40]}')
            continue
        if "." not in no:  # the TOC's own title ("فہرست مضامین مفصل", spelled "فہر ست" in vol 11)
            continue
        if no in seen:
            report["duplicate_index_no"].append(no)
            continue
        seen.add(no)
        title = clean_title(r["IndexText"])
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


_GROUP_TITLE = re.compile(r"^(کتاب|باب)\b")  # "کتاب الطہارۃ", "باب الوضوء" (not "بابت …", "کتابت …")


_BOOKLET_TITLE = re.compile(r"^ر\s?س\s?ا\s?ل\s?[ہۃة]\b")  # "رسالہ تجلی الیقین …" (vol 28 has stray spaces: "رسا لہ …")


def is_booklet_title(node: dict) -> bool:
    return bool(_BOOKLET_TITLE.match(tei.strip_marks(node["title"]).strip()))


def is_group(node: dict) -> bool:
    """A "کتاب …" / "باب …" entry that has children: a heading above chapters, no content of its own."""
    return bool(node["children"]) and bool(_GROUP_TITLE.match(tei.strip_marks(node["title"]).strip()))


def _grams(s: str) -> set[str]:
    """Character 3-grams of the letters only (marks, spaces and punctuation dropped): robust to spelling/spacing variants."""
    t = re.sub(r"[^\w]|\d|_", "", tei.strip_marks(s))
    return {t[i:i + 3] for i in range(len(t) - 2)}


TIE_MARGIN = 0.1  # a later entry only displaces an earlier one if its title matches clearly better (headings inside a fatwa follow it in the TOC)


def _pick_for_candidates(group: list[dict], spans: list[str]) -> list[int]:
    """More index entries than start rows on one page: some entries are headings INSIDE a fatwa, not fatawa.
    Choose, in order, which len(spans) entries own the start rows: maximise how much of each entry's title
    appears in the text that follows its row (monotonic DP; near-ties keep the earlier entry). Returns indexes into group."""
    g, c = len(group), len(spans)
    span_g = [_grams(t) for t in spans]
    sim = [[0.0] * c for _ in range(g)]
    for i, ch in enumerate(group):
        tg = _grams(ch["title"])
        if tg:
            for j in range(c):
                sim[i][j] = len(tg & span_g[j]) / len(tg)
        if ch.get("level") == 1:  # a booklet (رسالہ) always owns the start row it shares with its first chapter
            for j in range(c):
                sim[i][j] += 2.0
    NEG = float("-inf")
    best = [[NEG] * (c + 1) for _ in range(g + 1)]  # best[i][j]: first i entries fill first j rows
    take = [[False] * (c + 1) for _ in range(g + 1)]
    for i in range(g + 1):
        best[i][0] = 0.0
    for i in range(1, g + 1):
        for j in range(1, min(i, c) + 1):
            skip = best[i - 1][j]
            use = best[i - 1][j - 1] + sim[i - 1][j - 1] if best[i - 1][j - 1] > NEG else NEG
            if use > skip + TIE_MARGIN:
                best[i][j], take[i][j] = use, True
            else:
                best[i][j] = skip
    picked, i, j = [], g, c
    while j > 0 and i > 0:
        if take[i][j]:
            picked.append(i - 1)
            j -= 1
        i -= 1
    return picked[::-1]


def place_chapters(chapters: list[dict], rows: list[dict], cands: list[int], idx_page: dict) -> dict:
    """chapter no -> start row. Reading (page) order; start = first start-candidate on the
    chapter's page after the cursor, else the page's first row if no chapter began on that page yet.
    When a page lists more entries than it has start rows, the entries whose titles best match the text
    get the rows (the others are headings inside a fatwa and become sub-topics)."""
    placed, cursor = {}, -1
    first_row_of_page: dict[int, int] = {}
    for i, r in enumerate(rows):
        first_row_of_page.setdefault(r["page"], i)
    i = 0
    while i < len(chapters):
        page = idx_page.get(chapters[i]["no"])
        if page is None:
            i += 1
            continue
        j = i
        while j < len(chapters) and idx_page.get(chapters[j]["no"]) == page:
            j += 1
        group = chapters[i:j]
        i = j
        avail = [c for c in cands if c > cursor and rows[c]["page"] == page]
        if len(group) > len(avail) >= 1:
            spans = []
            for c in avail:
                nxt = next((x for x in cands if x > c), len(rows))
                spans.append(" ".join(r["text"] for r in rows[c:min(nxt, c + 60)]))
            for k, ci in zip(picked := _pick_for_candidates(group, spans), avail):
                placed[group[k]["no"]] = ci
                cursor = ci
            continue
        for ch in group:
            row = next((c for c in cands if c > cursor and rows[c]["page"] == page), None)
            if row is None:
                fr = first_row_of_page.get(page)
                if fr is not None and fr > cursor:
                    row = fr
            if row is not None:
                placed[ch["no"]] = row
                cursor = row
    return placed


# ── TEI assembly ─────────────────────────────────────────────────────────────
def front_heading(rows: list[dict], first: int) -> str | None:
    """Title for the pre-index "front" chapter: the first heading row's text (minus Bismillah lines), else None."""
    for r in rows[:first]:
        if r["code"] not in ("h", "hc"):
            continue
        lines = [re.sub(r"\s+", " ", l).strip() for l in r["text"].splitlines()]
        lines = [l for l in lines if l and "بسم" not in l]
        if not lines:
            continue
        t = lines[0]
        if t in ("رسالہ", "رسالہ ضمنیہ") and len(lines) > 1:
            t = f"{t}: {lines[1]}"
        return (t[1:-1] if t.startswith("(") and t.endswith(")") and t.count("(") == 1 else t).strip() or None
    # no heading: fall back to a short first line (e.g. vol 1a's abbreviations table), never a bare Bismillah
    for r in rows[:first]:
        line = next((l.strip() for l in r["text"].splitlines() if l.strip()), "")
        if line and "بسم" not in line and len(line) <= 80:
            return line
        break
    return None


def unit_tei(rows: list[dict], lo: int, hi: int, title: str | None, kind: str, n: str | None,
             page_book: dict, state: dict, anchors: dict) -> str:
    """One chapter's TEI. Each question ("مسئلہ N") / answer ("الجواب") becomes an <ab>."""
    parts: list[str] = []
    open_ab = None  # "question" | "answer" | None

    def close():
        nonlocal open_ab
        if open_ab:
            parts.append("</ab>")
            open_ab = None

    for i in range(lo, hi):
        r = rows[i]
        code, text = r["code"], r["text"]
        if code in ("h", "hc"):
            close()
        elif tei.is_masala_start(code, text):
            close()
            parts.append('<ab type="question">')
            open_ab = "question"
        elif open_ab == "question" and code in ("u", "uc") and tei.is_answer_start(text):
            close()
            parts.append('<ab type="answer">')
            open_ab = "answer"
        parts.extend(anchors.get(i, []))
        if r["page"] != state.get("page"):
            state["page"] = r["page"]
            bp = page_book.get(r["page"])
            if bp is None and r["page"]:
                state["unmapped_pages"].add(r["page"])
            if r["page"]:
                parts.append(f'<pb n="{tei.esc(bp or "")}" ana="digital-{r["page"]}"/>')
        parts.extend(tei.row_to_tei(code, text))
        state["emitted"] += 1
    close()
    nattr = f' n="{tei.esc(n)}"' if n else ""
    t = f"<head>{tei.esc(title)}</head>" if title else ""
    return f'<div type="{kind}"{nattr}>{t}{"".join(parts)}</div>'


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

    # ── levels: 0 group (heading above booklets/chapters, no text) / 1 booklet (رسالہ) / 2 chapter / 3 sub-topic.
    #  * booklet: the outermost "رسالہ …" entry (booklets nested inside a booklet are just chapters of it);
    #  * group:   a کتاب/باب entry at the top of the tree, or any heading that contains a booklet;
    #  * chapter: a direct child of a booklet, or a non-group entry outside any booklet;
    #  * everything deeper is a sub-topic (anchor) inside its chapter/booklet.
    by_no = {n["no"]: n for n in toc}

    def ancestors(n):
        p = by_no.get(n["parent"]) if n["parent"] else None
        while p:
            yield p
            p = by_no.get(p["parent"]) if p["parent"] else None

    for n in toc:  # parents precede children
        n["in_booklet"] = any(a_.get("booklet") for a_ in ancestors(n))
        n["booklet"] = is_booklet_title(n) and not n["in_booklet"]
    has_booklet_below = set()
    for n in toc:
        if n["booklet"]:
            has_booklet_below.update(a_["no"] for a_ in ancestors(n))
    for n in toc:
        p = by_no.get(n["parent"]) if n["parent"] else None
        if n["booklet"]:
            n["level"] = 1
        elif n["in_booklet"]:
            n["level"] = 2 if p["booklet"] else 3
        elif p is None or p["level"] == 0:
            n["level"] = 0 if (n["no"] in has_booklet_below or is_group(n)) else 2
        else:
            n["level"] = 3
    by_page = lambda n: (idx_page.get(n["no"], 10**9), idx_key(n["no"]))
    chapters_in = sorted((n for n in toc if n["level"] in (1, 2)), key=by_page)
    cands = find_candidates(rows)
    placed = place_chapters(chapters_in, rows, cands, idx_page)
    for n in chapters_in:  # a chapter we cannot locate is demoted to a sub-topic of the previous chapter
        if n["no"] not in placed:
            n["level"] = 3
            n["demoted"] = True
    rep["toc_nodes"] = len(toc)
    rep["books"] = rep["groups"] = sum(n["level"] == 0 for n in toc)
    rep["booklets"] = sum(n["level"] == 1 for n in toc)
    rep["chapters"] = sum(n["level"] == 2 for n in toc)
    rep["demoted_chapters"] = [n["no"] for n in toc if n.get("demoted")][:50]
    rep["demoted_count"] = sum(bool(n.get("demoted")) for n in toc)
    rep["subtopics"] = sum(n["level"] == 3 for n in toc)
    rep["candidates"] = len(cands)

    starts = sorted(set(placed.values()))
    start_chapter = {row: no for no, row in placed.items()}
    ends = dict(zip(starts, starts[1:] + [len(rows)]))
    first = starts[0] if starts else len(rows)

    # ── sub-topic anchors: exact start-candidate row when possible, else first row of its page,
    #    always inside the chapter whose row range contains it
    def chapter_of_row(row: int) -> str | None:
        lo = None
        for st in starts:
            if st <= row:
                lo = st
            else:
                break
        return start_chapter[lo] if lo is not None else None

    anchors: dict[int, list[str]] = {}
    sub_row: dict[str, int] = {}
    cursor = 0
    exact = page_level = no_page = 0
    for n in sorted((n for n in toc if n["level"] == 3), key=by_page):
        pg = idx_page.get(n["no"])
        row, how = None, ""
        if pg:
            row = next((c for c in cands if c >= cursor and rows[c]["page"] == pg and c not in start_chapter), None)
            how = "exact"
            if row is None:
                row = next((i for i in range(cursor, len(rows)) if rows[i]["page"] == pg), None)
                how = "page"
            if row is None:  # page numbers reset in this volume
                row = next((i for i, r in enumerate(rows) if r["page"] == pg), None)
                how = "page"
        if row is None:
            no_page += 1
            continue
        cursor = max(cursor, row) if how == "exact" or row >= cursor else cursor
        exact += how == "exact"
        page_level += how == "page"
        sub_row[n["no"]] = row
        anchors.setdefault(row, []).append(f'<anchor xml:id="s-{tei.esc(n["no"])}"/>')
    rep.update(subtopic_anchor_exact=exact, subtopic_anchor_page=page_level, subtopic_no_page=no_page)

    # ── output (groups/chapters first, in TOC order; then sub-topics)
    state = {"emitted": 0, "page": None, "unmapped_pages": set()}
    out: list[dict] = []
    sibling_sort: Counter = Counter()

    def add(key, parent, title, level, xml=None, anchor=None, title_en=None):
        k = (parent, level == 3)
        out.append({"key": key, "parent": parent, "sort": sibling_sort[k], "slug": f"{slug}-{key}",
                    "titleUr": title, "titleEn": title_en, "level": level, "anchorId": anchor, "tei": xml})
        sibling_sort[k] += 1

    front_title = front_heading(rows, first)
    # a front chapter holding only a Bismillah is noise: skip it (re-run build + import to apply)
    has_front = (first > 0 or not starts) and not (
        front_title is None and all(not r["text"].replace("بسم", "").strip() or "بسم" in r["text"] and len(r["text"]) < 60
                                    for r in rows[:first]))
    if has_front:
        add("front", None, front_title, 2, unit_tei(rows, 0, first, None, "front", None, page_book, state, anchors),
            title_en=None if front_title else "Front matter")
    for n in toc:
        if n["level"] == 3:
            continue
        parent = next((a_["no"] for a_ in ancestors(n) if a_["level"] in (0, 1)), None)  # nearest kept group / booklet
        xml = None
        if n["level"] in (1, 2):
            lo = placed[n["no"]]
            xml = unit_tei(rows, lo, ends[lo], n["title"], "booklet" if n["level"] == 1 else "chapter", n["no"], page_book, state, anchors)
        add(n["no"], parent, n["title"], n["level"], xml)
    for n in sorted((n for n in toc if n["level"] == 3), key=lambda n: idx_key(n["no"])):
        row = sub_row.get(n["no"])
        if row is None:  # no page in Map.csv: nothing to jump to and no chapter to belong to -> do not create a row
            rep.setdefault("subtopics_dropped_no_page", []).append(n["no"])
            continue
        ch = chapter_of_row(row)
        if ch is None:  # before the first unit -> front matter
            ch = "front" if has_front else next(iter(placed), None)
        add(n["no"], ch, n["title"], 3, anchor=f's-{n["no"]}')
    rep["rows_emitted"] = state["emitted"]
    rep["rows_parity_ok"] = state["emitted"] == len(rows)
    rep["pages_not_in_map_emitted"] = sorted(state["unmapped_pages"])

    bad = []
    for c in out:
        if c["tei"]:
            try:
                ET.fromstring(f'<r xmlns="http://www.tei-c.org/ns/1.0">{c["tei"]}</r>')
            except ET.ParseError as e:
                bad.append(f'{c["key"]}: {e}')
    rep["xml_errors"] = bad[:20]
    rep["xml_error_count"] = len(bad)
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
    folders = {folder_to_slug(p.name): p for p in a.data_dir.iterdir() if p.is_dir() and p.name.startswith("jild")}
    report = {"volumes": {}}
    for slug in sorted(wanted, key=sort_key):
        chapters = build_volume(slug, folders[slug], report)
        r = report["volumes"][slug]
        print(f'{slug:>3}: rows {r["rows"]:>5} parity={r["rows_parity_ok"]} toc {r["toc_nodes"]:>4} '
              f'groups {r["groups"]:>3} booklets {r["booklets"]:>3} chapters {r["chapters"]:>4} (demoted {r["demoted_count"]:>4}) subtopics {r["subtopics"]:>5} '
              f'exact {r["subtopic_anchor_exact"]:>4} xml_err {r["xml_error_count"]}')
        if not a.dry_run:
            d = OUT_DIR / slug
            d.mkdir(parents=True, exist_ok=True)
            (d / "chapters.json").write_text(json.dumps(chapters, ensure_ascii=False), encoding="utf-8")
    if not a.dry_run:
        OUT_DIR.mkdir(exist_ok=True)
        (OUT_DIR / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
