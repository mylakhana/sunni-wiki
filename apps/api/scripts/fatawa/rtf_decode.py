"""RTF decoder for the legacy `TextP=w` rows (Description is a `{\rtf1...}` blob).

Copied unchanged from docs/rtf_convert.py (decoder part only: `decode_formatted`
and helpers). The HTML classification layer was dropped — TEI rendering lives in
tei.py, and font -> script mapping is done there (the original knew only one
Arabic font name).
"""
import html as _html
import re


# ── RTF decoder ──────────────────────────────────────────────────────────────

# RTF \fcharsetN  ->  Python codec  (matches scripts/rtf_utils.py)
_CHARSET_TO_CODEC = {0: "cp1252", 178: "cp1256", 162: "cp1256"}
_DEFAULT_CODEC = "cp1256"

# Font name -> script guess. charset 178 alone can't tell Arabic from Urdu; the
# font *name* can. Al_Mushaf is the Quran/Arabic face; the Nastaleeq faces are Urdu.
_ARABIC_FONT_NAMES = {"al_mushaf"}
_URDU_FONT_NAMES = {"jameel noori nastaleeq", "aslam", "alvi nastaleeq"}

_ALIGN = {"qc": "center", "qr": "right", "ql": "left", "qj": "justify"}

# \pard-level control words worth keeping verbatim (beyond the interpreted ones).
_PARA_RAW_WORDS = {
    "sb", "sa", "sl", "slmult", "li", "ri", "fi", "tx", "nowidctlpar",
    "keep", "keepn", "rtlpar", "ltrpar",
}

_SKIP_GROUPS = {
    "fonttbl", "colortbl", "stylesheet", "listtable", "listoverridetable",
    "rsidtbl", "generator", "info", "pict", "object", "fldinst",
    "pntxta", "pntxtb", "themedata", "colorschememapping", "latentstyles",
}

# Character-level formatting control words whose delimiter space is often a
# content space absorbed by Word when a formatting boundary falls on a space
# (e.g. \fN \super\f0 char  or  \nosupersub \'xx). We recover the space when
# the next token in the RTF is also a control sequence (\) and we are mid-text.
_CHAR_DELIM_WORDS = {
    "f", "fs", "cf", "lang",
    "rtlch", "ltrch",
    "super", "nosupersub", "sub",
    "up", "dn",
    "expndtw", "kerning",
    "plain", "b", "i",
}


def _extract_group(rtf: str, keyword: str) -> str:
    """Return the inner text of `{\\keyword ...}`, honoring nested braces."""
    start = rtf.find("{\\" + keyword)
    if start == -1:
        return ""
    depth = 0
    for i in range(start, len(rtf)):
        if rtf[i] == "{":
            depth += 1
        elif rtf[i] == "}":
            depth -= 1
            if depth == 0:
                return rtf[start + 1 : i]
    return ""


def _guess_script(name: str, charset: int) -> str:
    low = name.strip().lower()
    if low in _ARABIC_FONT_NAMES:
        return "arabic"
    if low in _URDU_FONT_NAMES:
        return "urdu"
    if charset == 178:
        return "urdu"      # other Arabic-charset faces default to Urdu here
    return "latin"


def _parse_font_table(rtf: str) -> dict:
    """{font_id: {name, charset, codec, script}} from the RTF \\fonttbl group."""
    fonts: dict[int, dict] = {}
    body = _extract_group(rtf, "fonttbl")
    if not body:
        return fonts
    for entry in re.finditer(r"\{\\f(\d+)([^}]*)\}", body):
        fid = int(entry.group(1))
        inner = entry.group(2)
        cs_m = re.search(r"\\fcharset(\d+)", inner)
        charset = int(cs_m.group(1)) if cs_m else 0
        name_m = re.search(r"[ ]([^\\;{}]+);", inner)
        name = (name_m.group(1).strip() if name_m else f"f{fid}")
        fonts[fid] = {
            "name": name,
            "charset": charset,
            "codec": _CHARSET_TO_CODEC.get(charset, _DEFAULT_CODEC),
            "script": _guess_script(name, charset),
        }
    return fonts


def _parse_color_table(rtf: str) -> list:
    """index 0 = auto (None); then '#rrggbb' per \\colortbl entry."""
    m = re.search(r"\{\\colortbl([^}]*)\}", rtf)
    if not m:
        return [None]
    colors = [None]
    for part in m.group(1).split(";"):
        rm = re.search(r"\\red(\d+)", part)
        gm = re.search(r"\\green(\d+)", part)
        bm = re.search(r"\\blue(\d+)", part)
        if rm and gm and bm:
            colors.append(f"#{int(rm.group(1)):02x}{int(gm.group(1)):02x}{int(bm.group(1)):02x}")
    return colors


def _parse_stylesheet(rtf: str) -> dict:
    """{style_id: name} from \\stylesheet, e.g. {1: 'heading 1'}."""
    styles: dict[int, str] = {}
    body = _extract_group(rtf, "stylesheet")
    if not body:
        return styles
    for entry in re.finditer(r"\{\\s(\d+)\s+([^;}]+)[;}]", body):
        styles[int(entry.group(1))] = entry.group(2).strip()
    return styles


def _default_char_state() -> dict:
    return {
        "f": None, "fs": None, "cf": 0, "b": False, "i": False,
        "super": False, "lang": None, "up": 0, "uc": 1,
    }


def _default_para_props() -> dict:
    return {"alignment": "default", "direction": "ltr", "style": None, "raw": {}}


def _apply_control(word: str, param, char: dict, para: dict) -> None:
    """Mutate character/paragraph state for one control word."""
    # paragraph reset
    if word == "pard":
        para.clear()
        para.update(_default_para_props())
        return

    # paragraph-level
    if word in _ALIGN:
        para["alignment"] = _ALIGN[word]
        return
    if word == "rtlpar":
        para["direction"] = "rtl"
        para["raw"]["rtlpar"] = True
        return
    if word == "ltrpar":
        para["direction"] = "ltr"
        para["raw"]["ltrpar"] = True
        return
    if word == "s":
        para["style"] = param
        return
    if word in _PARA_RAW_WORDS:
        para["raw"][word] = param if param is not None else True
        return

    # character-level
    if word == "plain":
        char.update(_default_char_state())
    elif word == "f":
        char["f"] = param
    elif word == "fs":
        char["fs"] = param
    elif word == "cf":
        char["cf"] = param if param is not None else 0
    elif word == "b":
        char["b"] = param != 0
    elif word == "i":
        char["i"] = param != 0
    elif word == "super":
        char["super"] = True
    elif word in ("nosupersub", "sub"):
        char["super"] = False
    elif word == "up":
        char["up"] = param or 0
    elif word == "dn":
        char["up"] = -(param or 0)
    elif word == "lang":
        char["lang"] = param
    elif word == "uc":
        char["uc"] = param if param is not None else 1
    # rtlch / ltrch / expndtw etc. are intentionally not run-splitting here


def decode_formatted(rtf: str) -> dict:
    """Decode one RTF document into a structured dict of paragraphs and runs."""
    fonts = _parse_font_table(rtf)
    colors = _parse_color_table(rtf)
    styles = _parse_stylesheet(rtf)

    def codec_for(fid):
        return fonts.get(fid, {}).get("codec", _DEFAULT_CODEC) if fid is not None else _DEFAULT_CODEC

    paragraphs: list[dict] = []
    char = _default_char_state()
    char_stack: list[dict] = []
    para = _default_para_props()

    runs: list[dict] = []          # finished runs of the current paragraph
    cur_chars: list[str] = []      # buffer for the in-progress run
    cur_sig = None                 # formatting signature of the buffered run

    def signature(c):
        return (c["f"], c["fs"], c["cf"], c["b"], c["i"], c["super"], c["up"], c["lang"])

    def build_run(sig, text):
        fid, fs, cf, b, i, sup, up, lang = sig
        font = fonts.get(fid, {})
        return {
            "text": re.sub(r" {2,}", " ", text),   # collapse spaces; keep \t and \n
            "font": font.get("name"),
            "charset": font.get("charset"),
            "script": font.get("script"),
            "size_pt": (fs / 2) if fs else None,
            "color": colors[cf] if 0 <= cf < len(colors) else None,
            "bold": b,
            "italic": i,
            "superscript": sup,
            "baseline_shift": up or None,
            "lang": lang,
        }

    def flush_run():
        nonlocal cur_chars, cur_sig
        if cur_chars and cur_sig is not None:
            text = "".join(cur_chars)
            if text.strip():
                runs.append(build_run(cur_sig, text))
            elif runs:
                # Whitespace-only run (e.g. a \tab or space between two differently
                # formatted runs — the table-column pattern \lang…\tab\lang…). Keep it
                # as a separator on the previous run so words/columns don't mash and the
                # \t survives, but don't spawn a formatting-bearing run of its own.
                runs[-1]["text"] += re.sub(r" {2,}", " ", text)
            else:
                # Leading whitespace run — no previous run to attach to; create one
                # rather than silently dropping the space.
                runs.append(build_run(cur_sig, text))
        cur_chars = []
        cur_sig = None

    def emit(s: str):
        nonlocal cur_sig
        sig = signature(char)
        if cur_sig is None:
            cur_sig = sig
        elif sig != cur_sig:
            flush_run()
            cur_sig = sig
        cur_chars.append(s)

    def end_paragraph():
        flush_run()
        if runs:
            text = re.sub(r" {2,}", " ", "".join(r["text"] for r in runs)).strip("\r\n")
            if text:
                paragraphs.append({
                    "index": len(paragraphs),
                    "alignment": para["alignment"],
                    "direction": para["direction"],
                    "style_id": para["style"],
                    "style_name": styles.get(para["style"]) if para["style"] else None,
                    "para_props": dict(para["raw"]),
                    "text": text,
                    "runs": [dict(r) for r in runs],
                })
        runs.clear()

    i, n = 0, len(rtf)
    depth = 0
    skip_until = -1

    while i < n:
        ch = rtf[i]
        skipping = skip_until >= 0

        if ch == "{":
            depth += 1
            char_stack.append(dict(char))
            i += 1
            if skipping:
                continue
            # peek the group's control word to decide whether to skip the group
            j = i
            if j < n and rtf[j] == "\\":
                j += 1
                if j < n and rtf[j] == "*":
                    j += 1
                    while j < n and rtf[j] in " \t":
                        j += 1
                    if j < n and rtf[j] == "\\":
                        j += 1
                word = ""
                while j < n and rtf[j].isalpha():
                    word += rtf[j]
                    j += 1
                if word in _SKIP_GROUPS:
                    skip_until = depth - 1
            continue

        if ch == "}":
            flush_run()                     # formatting cannot span a group close
            depth -= 1
            if char_stack:
                char = char_stack.pop()
            if skip_until >= 0 and depth <= skip_until:
                skip_until = -1
            i += 1
            continue

        if skipping:
            i += 4 if (ch == "\\" and i + 1 < n and rtf[i + 1] == "'") else 1
            continue

        if ch == "\\":
            i += 1
            if i >= n:
                break
            nxt = rtf[i]

            # Escaped literal: \{  \}  \\
            if nxt in "{}\\":
                emit(nxt)
                i += 1
                continue

            # \'XX hex byte -> decode via active font codec
            if nxt == "'":
                hex_str = rtf[i + 1 : i + 3]
                i += 3
                try:
                    emit(bytes([int(hex_str, 16)]).decode(codec_for(char["f"]), errors="replace"))
                except ValueError:
                    pass
                continue

            # \uNNNN? unicode escape
            if nxt == "u" and i + 1 < n and (rtf[i + 1].isdigit() or rtf[i + 1] == "-"):
                i += 1
                num = ""
                if rtf[i] == "-":
                    num, i = "-", i + 1
                while i < n and rtf[i].isdigit():
                    num += rtf[i]
                    i += 1
                # skip uc fallback units: each may be a literal char or a \'XX hex escape
                uc_count = char.get("uc", 1)
                skipped = 0
                while skipped < uc_count and i < n and rtf[i] not in "\n{}":
                    if rtf[i] == "\\" and i + 1 < n and rtf[i + 1] == "'":
                        i += 4  # skip \'XX (backslash + apostrophe + 2 hex digits)
                    elif rtf[i] == "\\":
                        break   # other control sequence — leave it for the main loop
                    else:
                        i += 1  # single literal fallback char
                    skipped += 1
                try:
                    code = int(num)
                    emit(chr(code + 65536 if code < 0 else code))
                except (ValueError, OverflowError):
                    pass
                continue

            # \~ non-breaking space (U+00A0)
            if nxt == "~":
                emit(chr(160))
                i += 1
                continue

            # control word + optional numeric param
            word = ""
            while i < n and rtf[i].isalpha():
                word += rtf[i]
                i += 1
            param_str = ""
            if i < n and (rtf[i].isdigit() or rtf[i] == "-"):
                if rtf[i] == "-":
                    param_str, i = "-", i + 1
                while i < n and rtf[i].isdigit():
                    param_str += rtf[i]
                    i += 1
            param = int(param_str) if param_str and param_str != "-" else None
            delim_space = i < n and rtf[i] == " "
            if delim_space:
                i += 1
            _apply_control(word, param, char, para)
            if word == "par":
                end_paragraph()
            elif word == "line":
                emit("\n")          # soft break: keep within the same paragraph
            elif word == "tab":
                emit("\t")          # column separator (tables / aligned rows)
            elif word in _CHAR_DELIM_WORDS and delim_space and i < n and rtf[i] == "\\" and (cur_chars or runs):
                # Word RTF export absorbs content spaces as control-word delimiters when
                # a character-formatting change occurs mid-text immediately before another
                # control word or hex escape (e.g. \fN \super\f0 char, \nosupersub \'xx).
                # Recover the space as content only when we are mid-text and the next
                # token starts with \ (control word or \'XX hex escape).
                emit(" ")
            # Typography / punctuation control words (RTF spec §2.4)
            elif word == "lquote":
                emit("\u2018")      # ' LEFT SINGLE QUOTATION MARK
            elif word == "rquote":
                emit("\u2019")      # ' RIGHT SINGLE QUOTATION MARK
            elif word == "ldblquote":
                emit("\u201C")      # " LEFT DOUBLE QUOTATION MARK
            elif word == "rdblquote":
                emit("\u201D")      # " RIGHT DOUBLE QUOTATION MARK
            elif word == "bullet":
                emit("\u2022")      # • BULLET
            elif word == "emdash":
                emit("\u2014")      # — EM DASH
            elif word == "endash":
                emit("\u2013")      # – EN DASH
            elif word == "emspace":
                emit("\u2003")      # EM SPACE
            elif word == "enspace":
                emit("\u2002")      # EN SPACE
            elif word == "qmspace":
                emit("\u2005")      # FOUR-PER-EM SPACE
            continue

        # raw source char: RTF ignores literal CR/LF; keep other printable chars
        if ch not in "\r\n":
            emit(ch)
        i += 1

    end_paragraph()  # flush trailing paragraph if the doc didn't end on \par

    return {
        "source_is_rtf": rtf.lstrip().startswith("{\\rtf"),
        "fonts": {str(k): v for k, v in fonts.items()},
        "colors": colors,
        "styles": {str(k): v for k, v in styles.items()},
        "paragraph_count": len(paragraphs),
        "paragraphs": paragraphs,
    }
