# Data import — Fatawa Razawiyyah (legacy CSV → TEI → DB)

Source: `data-extracted/01 Fatawa Razaviyya/` (31 `jild` folders + `Images/`, untouched).

## Run order (from `apps/api`)
1. `python3 scripts/seed_fatawa_razawiyyah.py` — Author, Category, Book, 31 Volumes (`1a,1b,2..30`). Idempotent.
2. `cd scripts && python3 -m fatawa.build --all` — CSV → `scripts/out/<vol>/chapters.json` + `scripts/out/report.json` (git-ignored). `--dry-run`, `--volume N` supported.
3. `python3 scripts/import_fatawa.py --all` — wipes the volumes' chapters/content, then inserts. Idempotent.

## Source format
- `TextContainer.csv` `SNo,Description,PageNo,TextP,DataOrder,Alignment` — rows in reading order. `DataOrder`/`Alignment` always empty. `PageNo` = digital page chunk. `TextP` = paragraph type (h, hc, u, uc, a, ac, q, qc, t, tc, s, sc, i, e/ec, c, **w = RTF blob**). ~30 dirty codes are normalised (`normalize_code`, every remap logged in the report).
- `IndexContainer.csv` — TOC only; dotted `IndexNo`. Titles are not present in the text.
- `Map.csv` — `IndexNo → PageNo` and `PageNo → BookPageNo` (printed pages, shown as `<pb n="89-96">`).
- UTF-8 with BOM, multiline quoted cells.

## Levels (`chapters.level`) and linking rule
IndexNo depth alone does not say what a chapter is, so each TOC entry gets a level:
- **0 = group** — heading above booklets/chapters, no text: a top-level "کتاب …" / "باب …" entry that has children (groups can nest, e.g. کتاب الطہارۃ → باب الوضوء), or any heading that contains a booklet (e.g. "فاتحہ وایصال ثواب").
- **1 = booklet** — the outermost "رسالہ …" entry. Owns TEI = its title page / intro (the text before its first chapter; the whole booklet if it has no chapters). Booklets nested inside a booklet are chapters of it.
- **2 = chapter** — owns the TEI: a booklet's direct children, or a non-group entry outside any booklet (parent = nearest group, or none). Plus one `front` chapter per volume for text before the first unit.
- **3 = sub-topic** — everything deeper. No text: a row with `parentId` = its booklet/chapter and `anchorId` = `s-<IndexNo>`, the `xml:id` of an `<anchor/>` inside that TEI.

Placement (TOC → text): a TOC entry only points to a digital *page*. Booklets and chapters are placed in page order on the first start row (heading row or "مسئلہ N" row) of their page, else on the page's first row if no unit began there yet. When a page lists **more entries than it has start rows**, the entries whose titles best match the text that follows each start row get the rows (3-gram overlap, monotonic DP; near-ties keep the earlier TOC entry because a heading inside a fatwa follows the fatwa's own entry; booklets always win); the others are headings inside a fatwa and become sub-topics (e.g. vol 7 `1.001.002`). A unit that cannot be located is **demoted to a sub-topic** of the preceding unit (so nothing is empty; listed in the report as `demoted_chapters`). Sub-topic anchors go on an exact start row when one exists, otherwise on the first row of their page. A sub-topic whose page is missing from `Map.csv` (no anchor, no parent) is **not created** (listed as `subtopics_dropped_no_page` in the report). Each fatwa inside a unit is wrapped as `<ab type="question">` / `<ab type="answer">`.
Result (before the title-matching placement above: 131 booklets, 5183 chapters, 21803 sub-topics, 15367 demoted; re-run the build for current numbers): 143 groups; all ~140k rows emitted exactly once; every fragment well-formed; every `anchorId` resolves inside its parent's TEI.
The index root (single-level IndexNo, e.g. "فہرست مضامین مفصل" — spelled "فہر ست" in vol 11) is always dropped; rows with a non-numeric IndexNo (vol 27 has one numbered "ز") are skipped and listed as `bad_index_no`.

## TEI mapping
h/hc → `<head>`; u/uc/c → `<p xml:lang="ur">`; a → `<p xml:lang="ar">`; ac → `<quote xml:lang="ar">`; q/qc → `<quote type="quran">`; t/tc → `<note type="citation">`; s/sc → `<note type="footnote" place="foot">` (pure separators dropped); i → `<figure><graphic url="Images/NAME"/>`; e/ec → `<p xml:lang="en">`; question/answer → `<ab type="question|answer">`; RTF → inline `<quote type="quran">` / `<foreign xml:lang>` by run font (Quranic_Font = Quran, Nafees Web Naskh/Al_Mushaf = Arabic, Alvi/Aslam = Urdu), bold → `<hi rend="bold">`, tab rows → `<table>`.
RTF decoder = copy of `docs/rtf_convert.py` decoder (`scripts/fatawa/rtf_decode.py`); the HTML layer was replaced by the TEI emitter.

**RTF (`w`) row classification** (`tei.py` → `rtf_to_tei`, rules from a survey of all 305 `w` rows in vols 1–30). Per paragraph, using the dominant run's size/colour and the paragraph alignment:
- centred, ≥20pt, Aslam/Alvi font, ≤300 chars → `<head rend="center">`
- red (`#ff0000`) or purple (`#800080`) text ≤15pt → `<note type="citation">`; any text ≤11pt → `<note type="footnote">`
- centred Arabic → `<quote xml:lang="ar">`; Quranic font → `<quote type="quran">`
- 7pt near-empty paragraphs → dropped; centred prose gets `rend="center"`; everything else → `<p>`.

## Known gaps (report-only)
- Sub-topic anchors are exact only when a heading/question row exists on their page (about 40%); otherwise they point at the start of their page. Nesting below a sub-topic is flat (derive depth from the slug if needed).
- Book detection is title-based ("کتاب" at top level). Chapter content in volumes with many demoted chapters (e.g. 12, 16, 18–21) is coarse.
- Images are not copied or renamed; stray files (`xx.jpg`, `zz.jpg`, `2626.jpg`) and the vol-1 prefix ambiguity (1A/1B) are only referenced by name from `TextP=i` rows.
- A few TOC nodes point to pages without rows (vols 6, 13, 15, 27): listed as `toc_dropped_no_page` in the report; vol 4 has an outlier PageNo 2323.

## API & reader behaviour (levels)
- `GET /v1/books/:slug/chapters` items carry `level` (0–3) and `anchorId`; `hasChildren` for a booklet means "has chapters". Volume `chapterCount` counts booklets + chapters; `topLevelCount` counts booklets only (level 1), shown when the reader sidebar hides topics.
- `GET /v1/books/:slug/chapters/:chapterSlug` returns `level`, `anchorId` and `redirect`: for a group (level 0) the first booklet/chapter below it (through nested groups), for a sub-topic (level 3) its parent + `anchorId`. Breadcrumb entries carry `level`. Prev/next only visit entries with text (a booklet's intro comes right before its first chapter).
- Reader (`apps/web`), contents tree inside an expanded volume: groups (کتاب/باب) are non-clickable header titles; inside them booklets are tiles that open the booklet on the right when clicked, and only their chevron expands the list of its chapters (collapsed by default; the booklet of the chapter being read opens automatically). Chapters that belong to no booklet are listed directly under their group. Opening a group or sub-topic URL redirects to the entry that has the text; for a sub-topic it also picks the right `?part=N` and jumps to `#s-<IndexNo>`.
- Long chapters (> 250k chars of TEI) are cut into render-only parts of ~60k chars (frontend only, nothing stored in the DB). The reader sees no part controls: part 1 is rendered with the page, and each following part is fetched by a server action (`lib/tei/parts-action.tsx`) and appended when the reader nears the end (`components/library/lazy-parts.tsx`). A sub-topic deep link starts at the part containing its anchor and continues forward from there.
- The seed sets the book `published = 1`. Note: the web app caches API data for ~1h (`use cache`, tag `library`) — after re-importing, restart the web server or call `revalidateTag("library")` to see new data immediately.
