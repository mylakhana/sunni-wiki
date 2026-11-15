"""Per-book configuration for the books imported by the generic `multibook` pipeline (books 03-05).

To add another book of the same CSV family (IndexContainer.csv + TextContainer.csv per volume, no Map.csv,
PageNo shared by index and text) append an entry to BOOKS. Every book gets its own DB rows (looked up by slug)
and its own output folder scripts/out/<book slug>/, so books never touch each other.
"""
import re
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[2]
DATA_ROOT = API_DIR.parents[2] / "data-extracted"  # v3/data-extracted (sibling of sunni-wiki/)

CATEGORIES = {
    "hadith": dict(slug="hadith", titleEn="Hadith", titleAr="الحديث", titleUr="حدیث", sort=2),
    "tafseer": dict(slug="tafseer", titleEn="Tafseer", titleAr="التفسير", titleUr="تفسیر", sort=3),
}

FAIZAN_DESCRIPTION = """شیخ الاسلام الحافظ الامام محی الدین ابوزکریا یحیٰی بن شَرَف نَوَوِی عَلَیْہِ رَحْمَۃُ اللہِ الْقَوِی (متوفّٰی۶۷۲ہجری)

کی مشہورِزمانہ کتاب

رِیاضُ الصَّالِحِیْن

کا اُردو ترجمہ و وضاحت بنام

اَنْوَارُالْمُتَّقِیْن شرحُ رِ یاضِ الصَّالِحِیْن

المعروف

فیضانِ ریاض الصالحین"""

BOOKS = {
    "miraat": dict(
        dir="03 Miraat-ul-Manajeh",
        author=dict(
            slug="hakeem-ul-ummat-mufti-ahmed-yaar-khan-naeemi-badayuni",
            nameEn="Hakeem ul Ummat Mufti Ahmed Yaar Khan Naeemi Badayuni",
            nameAr="حكيم الأمة مفتي أحمد يار خان النعيمي البدايوني",
            nameUr="حکیم الامت مفتی احمد یار خان نعیمی بدایونی",
        ),
        category="hadith",
        book=dict(
            slug="miraat-ul-manajeeh",
            titleEn="Miraat ul Manajeeh Sharah Mishkaat Ul Masabeeh",
            titleAr="مرآة المناجيح شرح مشكاة المصابيح",
            titleUr="مراٰۃ المناجیح شرح مشکوٰۃ المصابیح",
            languages='["ur"]',
            published=1,
        ),
        volumes=list(range(1, 9)),
        demote_hadith=False,
    ),
    "faizan": dict(
        dir="04 Faizan e Riaz ul Saliheen",
        author=dict(
            slug="hafiz-imam-muhiuddin-abu-zakariyya-yahya-bin-sharaf-nawawi",
            nameEn="Hafiz Imam Muhiuddin Abu Zakariyya Yahya Bin Sharaf Nawawi",
            nameAr="الحافظ الإمام محيي الدين أبو زكريا يحيى بن شرف النووي",
            nameUr="حافظ امام محی الدین ابوزکریا یحیٰی بن شرف نووی",
        ),
        category="hadith",
        book=dict(
            slug="faizan-e-riaz-ul-saliheen",
            titleEn="Faizan e Riaz ul Saliheen",
            titleAr="فيضان رياض الصالحين",
            titleUr="فیضانِ ریاض الصالحین",
            description=FAIZAN_DESCRIPTION,
            languages='["ar","ur"]',
            published=1,
        ),
        volumes=[1, 2, 3, 5, 6, 7],  # Jild 4 is not in the extracted data (yet)
        demote_hadith=True,  # "حدیث نمبر" top-level nodes sit under their "باب نمبر" chapter
    ),
    "siraat": dict(
        dir="05 Siraat ul Jinaan",
        author=dict(
            slug="mufti-muhammad-qassim-attari",
            nameEn="Mufti Muhammad Qassim Attari",
            nameAr="مفتي محمد قاسم عطاري",
            nameUr="مفتی محمد قاسم عطاری",
        ),
        category="tafseer",
        book=dict(
            slug="siraat-ul-jinaan",
            titleEn="Siraat ul Jinaan Fi Tafseer Al Quran",
            titleAr="صراط الجنان في تفسير القرآن",
            titleUr="صراط الجنان فی تفسیر القرآن",
            languages='["ar","ur"]',
            published=1,
        ),
        volumes=list(range(1, 11)),
        demote_hadith=False,
    ),
}


def folder_number(name: str) -> int | None:
    """'Miraat-ul-Manajeh-jild-1' / 'Jild 7 ' / 'si-raat-ul-jinan-jild-10' -> int."""
    m = re.search(r"(\d+)\s*$", name)
    return int(m.group(1)) if m else None


def volume_folders(book: str, data_root: Path = DATA_ROOT) -> dict[str, Path]:
    """slug -> folder, validated against the expected volume list of the book."""
    cfg = BOOKS[book]
    base = data_root / cfg["dir"]
    found = {}
    for p in base.iterdir():
        if p.is_dir():
            n = folder_number(p.name)
            if n is None:
                raise SystemExit(f"Unrecognised volume folder: {p.name!r}")
            found[str(n)] = p
    want = [str(n) for n in cfg["volumes"]]
    if sorted(found, key=int) != want:
        raise SystemExit(f"{book}: volume folders {sorted(found, key=int)} != expected {want}")
    return found


def volume_slugs(book: str) -> list[str]:
    return [str(n) for n in BOOKS[book]["volumes"]]


def out_dir(book: str) -> Path:
    return API_DIR / "scripts" / "out" / BOOKS[book]["book"]["slug"]
