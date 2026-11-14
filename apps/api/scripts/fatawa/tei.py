"""Row (TextP code + text) -> TEI XML snippets, plus TextP normalisation."""
import re
from collections import Counter
from xml.sax.saxutils import escape

from .rtf_decode import decode_formatted

_ILLEGAL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]")
_MARKS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")
_URDU_ONLY = set("ٹڈڑںےگچپژ")
_ARABIC_RANGE = re.compile(r"[؀-ۿ]")
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "0123456789" * 2)

KNOWN = {"h", "hc", "u", "uc", "a", "ac", "q", "qc", "t", "tc", "s", "sc", "i", "e", "ec", "w", "c"}

# Run font (lower-case) -> script. Verified on vols 24/30: Alvi/Aslam = Urdu prose,
# Nafees Web Naskh/Al_Mushaf = Arabic (hadith, fiqh text), Quranic_Font = Quran.
QURAN_FONTS = {"quranic_font", "al qalam quran majeed web2_d"}
ARABIC_FONTS = {"al_mushaf", "nafees web naskh"}
URDU_FONTS = {"alvi nastaleeq", "aslam", "jameel noori nastaleeq"}


def esc(s: str) -> str:
    return escape(_ILLEGAL.sub("", s))


def strip_marks(s: str) -> str:
    return _MARKS.sub("", s)


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace(" ", " ")).strip()


def text_script(text: str) -> str:
    """'ur' / 'ar' / 'en' guess for a bare line (Urdu-only letters => Urdu)."""
    s = strip_marks(text)
    if not _ARABIC_RANGE.search(s):
        return "en"
    if any(ch in _URDU_ONLY for ch in s):
        return "ur"
    # Arabic prose in this corpus is typed with Urdu letters (ہ ی ک), so also
    # look for common Urdu function words.
    if re.search(r"\b(کے|ہے|ہیں|کی|کہ|میں|اور|سے|کو|ہو|نہ)\b", s):
        return "ur"
    return "ar"


def normalize_code(code: str, text: str, remaps: Counter) -> str:
    """Clean a dirty TextP value; log every change in `remaps`."""
    raw = code
    c = re.sub(r"\s+", "", code or "").lower()
    if c in KNOWN:
        if c != raw:
            remaps[f"{raw!r}->{c}"] += 1
        return c
    t = clean(text)
    if c in ("us", "as", "sa", "su"):
        out = "s"
    elif c in ("ut", "tu", "tr"):
        out = "t"
    elif re.match(r"^\(\s*[\d۰-۹]*\s*؎", t):
        out = "t"
    elif t.startswith("عہ"):
        out = "s"
    else:
        out = "a" if text_script(t) == "ar" else ("e" if text_script(t) == "en" else "u")
    remaps[f"{raw!r}->{out}"] += 1
    return out


def is_separator(text: str) -> bool:
    core = re.sub(r"[\s_ـ\-.…*٭•]", "", strip_marks(text))
    return len(set(core)) <= 1


def is_masala_start(code: str, text: str) -> bool:
    return code in ("u", "uc", "c") and bool(re.match(r"\s*مسئل[ہۃة]", text))


def is_answer_start(text: str) -> bool:
    return bool(re.match(r"\s*الجواب", strip_marks(text)))


# ── single-text rows ─────────────────────────────────────────────────────────
def _el(tag: str, text: str, lang: str | None = None, **attrs) -> str:
    a = "".join(f' {k.replace("_", ":") if k == "xml_lang" else k}="{esc(v)}"' for k, v in attrs.items())
    if lang:
        a = f' xml:lang="{lang}"' + a
    return f"<{tag}{a}>{esc(clean(text))}</{tag}>"


def row_to_tei(code: str, text: str) -> list[str]:
    """Return the TEI elements for one non-RTF row ([] for pure separators)."""
    if code == "w":
        return rtf_to_tei(text)
    t = clean(text)
    if not t:
        return []
    lang = text_script(t)
    lang = lang if lang != "en" or code in ("e", "ec") else "ur"
    if code == "h":
        return [_el("head", t, lang)]
    if code == "hc":
        return [_el("head", t, lang, type="sub")]
    if code in ("u", "uc", "c"):
        return [_el("p", t, "ur" if lang == "en" else lang)]
    if code == "a":
        return [_el("p", t, "ar")]
    if code == "ac":
        return [_el("quote", t, "ar")]
    if code in ("q", "qc"):
        return [_el("quote", t, "ar", type="quran")]
    if code in ("t", "tc"):
        return [_el("note", t, lang, type="citation" if code == "t" else "citation-translation")]
    if code in ("s", "sc"):
        if is_separator(t):
            return []
        return [_el("note", t, lang, type="footnote", place="foot")]
    if code == "i":
        # Images stay where they are (Images/ is untouched); we only reference the name.
        return [f'<figure><graphic url="Images/{esc(t)}"/></figure>']
    if code in ("e", "ec"):
        return [_el("p", t, "en")]
    return [_el("p", t, lang)]


# ── RTF rows ─────────────────────────────────────────────────────────────────
def _run_script(run: dict) -> str | None:
    f = (run.get("font") or "").strip().lower()
    if f in QURAN_FONTS:
        return "quran"
    if f in ARABIC_FONTS:
        return "arabic"
    if f in URDU_FONTS:
        return "urdu"
    return None  # neutral (Sans Serif digits/punctuation, spaces)


def _runs_to_inline(runs: list[dict]) -> tuple[str, str]:
    """Merge runs into inline TEI. Returns (xml, dominant: urdu|arabic|quran)."""
    weight = Counter()
    segs: list[list] = []  # [script, bold, text]
    last = "urdu"
    for r in runs:
        sc = _run_script(r)
        txt = r["text"]
        if sc is None:
            sc = last  # neutral runs follow the surrounding script
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
    decoded = decode_formatted(rtf)
    paras = decoded.get("paragraphs", [])
    out: list[str] = []
    i = 0
    while i < len(paras):
        p = paras[i]
        style = (p.get("style_name") or "").lower()
        text = clean(p["text"])
        if not text:
            i += 1
            continue
        if "\t" in p["text"] and not style.startswith("heading"):
            rows = []
            while i < len(paras) and "\t" in paras[i]["text"]:
                cells = [clean(c) for c in paras[i]["text"].split("\t") if clean(c)]
                rows.append("<row>" + "".join(f'<cell xml:lang="ur">{esc(c)}</cell>' for c in cells) + "</row>")
                i += 1
            out.append("<table>" + "".join(rows) + "</table>")
            continue
        i += 1
        inline, dom = _runs_to_inline(p["runs"])
        if not inline:
            continue
        lang = "ar" if dom in ("arabic", "quran") else "ur"
        if style.startswith("heading"):
            out.append(f'<head xml:lang="{lang}">{inline}</head>')
        elif re.match(r"^\(?\s*[\d۰-۹]*\s*؎", text):
            out.append(f'<note type="citation" xml:lang="{lang}">{inline}</note>')
        elif text.startswith("عہ") and len(text) < 2000:
            out.append(f'<note type="footnote" place="foot" xml:lang="{lang}">{inline}</note>')
        elif dom == "quran":
            out.append(f'<quote type="quran" xml:lang="ar">{inline}</quote>')
        else:
            out.append(f'<p xml:lang="{lang}">{inline}</p>')
    return out
