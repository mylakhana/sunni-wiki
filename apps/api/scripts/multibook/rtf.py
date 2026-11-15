"""RTF `w` rows -> TEI for books 03-05 (Faizan e Riaz ul Saliheen, Siraat ul Jinaan, Miraat).

Copy of fatawa.tei.rtf_to_tei (Fatawa's version stays untouched) with the fonts/size thresholds of these books:
  Urdu prose   : Jameel Noori Nastaleeq, Noori Nastaliq, Alvi Nastaleeq, Aslam
  Arabic       : Al_Mushaf, Trad Arabic Bold Unicode (+ "(Arabi" truncated name), Nafees Web Naskh
  Quran        : Al Qalam Quran Majeed Web2_D, Quranic_Font
  neutral      : Arial, Times New Roman, Arial Unicode MS, Sans Serif (follow the surrounding script)
Footnote / citation threshold is <=13pt (Fatawa: <=11pt): Siraat/Faizan citations are 12-13pt.
"""
import re
from collections import Counter

from fatawa.rtf_decode import decode_formatted
from fatawa.tei import clean, esc

QURAN_FONTS = {"quranic_font", "al qalam quran majeed web2_d"}
ARABIC_FONTS = {"al_mushaf", "nafees web naskh", "trad arabic bold unicode", "trad arabic bold unicode (arabi"}
URDU_FONTS = {"alvi nastaleeq", "aslam", "jameel noori nastaleeq", "jameel noori nastaleeq (hebrew)", "noori nastaliq"}
TITLE_FONTS = {"aslam", "alvi nastaleeq", "noori nastaliq"}
CITATION_COLORS = {"#ff0000", "#800080"}
SMALL_PT = 13


def _para_format(p: dict) -> tuple[float | None, str | None, bool]:
    runs = [r for r in p["runs"] if r["text"].strip()]
    r = max(runs, key=lambda r: len(r["text"].strip())) if runs else {}
    return r.get("size_pt"), (r.get("color") or "").lower() or None, p.get("alignment") == "center"


HEADING_FONT = "aslam"  # the books set every heading/sub-heading in Aslam; body text is Jameel Noori Nastaleeq
HEADING_MIN_PT = 16
HEADING_MAX_LEN = 200
TRANSLATION_INLINE = re.compile(r'^(<foreign xml:lang="ar">)?(ترجم[^\s:<>]{0,3}\s*کنز(?:[^\s:<>]+|\s+[^\s:<>]+))(</foreign>)?')
TRANSLATION_LABEL = re.compile(r"^\s*ترجم\S{0,3}\s*کنز(?:[^\s:]+|\s+[^\s:]+)")  # "ترجمۂ کنزالایمان" / "ترجمۂ کنزُالعِرفان" (set in Al_Mushaf)


def _is_aslam_heading(p: dict) -> bool:
    """Short paragraph set in Aslam (>=16pt) = heading, even without a Word heading style.

    Runs in an Arabic face (honorifics like رَضِیَ اللہ تَعَالٰی عَنْہ) and neutral faces (Arial digits) may sit
    inside a heading; any other Urdu/Quran run (= body prose) disqualifies it. Punctuation-only runs (the ':')
    are ignored.
    """
    runs = [r for r in p["runs"] if re.sub(r"[\W_]+", "", r["text"])]
    if not runs or sum(len(r["text"].strip()) for r in runs) > HEADING_MAX_LEN:
        return False
    aslam = 0
    for r in runs:
        f = (r.get("font") or "").strip().lower()
        if f == HEADING_FONT:
            if (r.get("size_pt") or 0) < HEADING_MIN_PT:
                return False
            aslam += len(r["text"].strip())
        elif _run_script(r) is not None and f not in ARABIC_FONTS:
            return False
    total = sum(len(r["text"].strip()) for r in runs)
    return aslam >= 0.3 * total


def _run_script(run: dict) -> str | None:
    f = (run.get("font") or "").strip().lower()
    if f in QURAN_FONTS:
        return "quran"
    if f in ARABIC_FONTS:
        return "arabic"
    if f in URDU_FONTS:
        return "urdu"
    return None


def _runs_to_inline(runs: list[dict]) -> tuple[str, str]:
    weight = Counter()
    segs: list[list] = []
    last = "urdu"
    for r in runs:
        sc = _run_script(r)
        txt = r["text"]
        if sc is None:
            sc = last
        else:
            last = sc
            weight[sc] += len(txt.strip())
        bold = bool(r.get("bold"))
        if segs and segs[-1][0] == sc and segs[-1][1] == bold:
            segs[-1][2] += txt
        else:
            segs.append([sc, bold, txt])
    dominant = weight.most_common(1)[0][0] if weight else "urdu"
    out = []
    for sc, bold, txt in segs:
        x = esc(txt.replace("\t", " ").replace("\n", " "))
        if bold:
            x = f'<hi rend="bold">{x}</hi>'
        if sc != dominant and txt.strip():
            if sc == "quran":
                x = f'<quote type="quran" xml:lang="ar">{x}</quote>'
            elif sc == "arabic":
                x = f'<foreign xml:lang="ar">{x}</foreign>'
            else:
                x = f'<foreign xml:lang="ur">{x}</foreign>'
        out.append(x)
    return re.sub(r" {2,}", " ", "".join(out)).strip(), dominant


def rtf_to_tei(rtf: str) -> list[str]:
    paras = decode_formatted(rtf).get("paragraphs", [])
    out: list[str] = []
    i = 0
    while i < len(paras):
        p = paras[i]
        style = (p.get("style_name") or "").lower()
        text = clean(p["text"])
        if not text:
            i += 1
            continue
        def _cells(t: str) -> list[str]:
            return [clean(c) for c in t.split("\t") if clean(c)]

        if len(_cells(p["text"])) > 1 and not style.startswith("heading"):  # a lone leading tab is just an indent
            rows = []  # consecutive tab-separated paragraphs (verse hemistichs, tables) -> <table>
            while i < len(paras) and len(_cells(paras[i]["text"])) > 1:
                rows.append("<row>" + "".join(f'<cell xml:lang="ur">{esc(c)}</cell>' for c in _cells(paras[i]["text"])) + "</row>")
                i += 1
            out.append("<table>" + "".join(rows) + "</table>")
            continue
        i += 1
        inline, dom = _runs_to_inline(p["runs"])
        if not inline:
            continue
        lang = "ar" if dom in ("arabic", "quran") else "ur"
        size, color, centered = _para_format(p)
        if size is not None and size <= 7 and len(text) < 3:
            continue
        rend = ' rend="center"' if centered else ""
        first_font = ((p["runs"][0].get("font") or "").strip().lower()) if p["runs"] else ""
        if style.startswith("heading") or _is_aslam_heading(p) or (
            centered and size and size >= 20 and dom == "urdu" and len(text) <= 300 and first_font in TITLE_FONTS
        ):
            out.append(f'<head xml:lang="{lang}"{rend}>{inline}</head>')
        elif re.match(r"^\(?\s*[\d۰-۹]*\s*؎", text):
            out.append(f'<note type="citation" xml:lang="{lang}">{inline}</note>')
        elif dom == "quran":
            out.append(f'<quote type="quran" xml:lang="ar">{inline}</quote>')
        elif color in CITATION_COLORS and size is not None and size <= 15:
            out.append(f'<note type="citation" xml:lang="{lang}">{inline}</note>')
        elif size is not None and size <= SMALL_PT:
            out.append(f'<note type="footnote" place="foot" xml:lang="{lang}">{inline}</note>')
        elif dom == "arabic" and centered:
            out.append(f'<quote xml:lang="ar">{inline}</quote>')
        elif TRANSLATION_LABEL.match(text) and TRANSLATION_INLINE.match(inline):  # label is set in Al_Mushaf but is Urdu, not Arabic
            body = TRANSLATION_INLINE.sub(
                lambda m: f"<label>{m.group(2)}</label>" + (m.group(1) if m.group(1) and not m.group(3) else ""), inline, count=1)
            out.append(f'<p type="translation" xml:lang="ur"{rend}>{body}</p>')
        else:
            out.append(f'<p xml:lang="{lang}"{rend}>{inline}</p>')
    return out
