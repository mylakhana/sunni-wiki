"""Per-book configuration for the books imported by the generic `multibook` pipeline (books 03-05).

To add another book of the same CSV family (IndexContainer.csv + TextContainer.csv per volume, no Map.csv,
PageNo shared by index and text) append an entry to BOOKS. Every book gets its own DB rows (looked up by slug)
and its own output folder scripts/out/<book slug>/, so books never touch each other.
"""
import json
import re
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[2]
DATA_ROOT = API_DIR.parents[2] / "data-extracted"  # v3/data-extracted (sibling of sunni-wiki/)

CATEGORIES = {
    "fatawa": dict(slug="fatawa", titleEn="Fatawa", titleAr="فتاوى", titleUr="فتاویٰ", sort=0),  # same as the Fatawa seed
    "hadith": dict(slug="hadith", titleEn="Hadith", titleAr="الحديث", titleUr="حدیث", sort=2),
    "tafseer": dict(slug="tafseer", titleEn="Tafseer", titleAr="التفسير", titleUr="تفسیر", sort=3),
    "aqaid": dict(slug="aqaid", titleEn="Aqaid & Kalam", titleAr="العقائد والكلام", titleUr="عقائد و کلام", sort=5),
    "tasawwuf": dict(slug="tasawwuf", titleEn="Tasawwuf", titleAr="التصوف", titleUr="تصوف", sort=6),
    "rasail": dict(slug="rasail", titleEn="Rasail & Other Works", titleAr="الرسائل", titleUr="رسائل و دیگر تصانیف", sort=7),
    "durood": dict(slug="durood", titleEn="Durood & Wazaif", titleAr="الصلوات والأوراد", titleUr="درود و وظائف", sort=4),
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
    # Book 06: no volumes (TextContainer.csv / IndexContainer.csv directly in the book folder). volumes=None.
    "dalail": dict(
        dir="06 Dalail ul Khairat",
        author=dict(
            slug="imam-jazuli",
            nameEn="Shaikh Muhammad bin Sulaiman Al-Jazuli",
            nameAr="الشيخ محمد بن سليمان الجزولي",
            nameUr="شیخ محمد بن سلیمان جزولی",
        ),
        category="durood",
        book=dict(
            slug="dalail-ul-khairat",
            titleEn="Dalail ul Khairat",
            titleAr="دلائل الخيرات",
            titleUr="دلائل الخیرات",
            languages='["ar","ur"]',
            published=1,
        ),
        volumes=None,
        demote_hadith=False,
    ),
}

# ── Bulk addition: data-extracted/bulk-addition/<folder>/ = one volume-less book each, all by Imam Ahmed Raza Khan ──
BULK_DIR = "bulk-addition"
BULK_AUTHOR = dict(slug="imam-ahmed-raza-khan")  # created by the Fatawa Radawiyyah seed; only referenced here
MEDIA_URL = "/media"  # data-extracted/bulk-addition/Images/ -> apps/web/public/media/ (scripts/copy_media.py)
# key: (folder, slug, category, titleEn, titleAr, titleUr, languages)
_BULK = [
    ("Al-Fadl-Ul-Maouhabi", "al-fadl-ul-mauhabi", "hadith", "Al Fadl ul Mauhabi", "الفضل الموهبي في معنى إذا صح الحديث فهو مذهبي", "الفضل الموہبی فی معنیٰ اذا صح الحدیث فھو مذہبی", ["ar", "ur"]),
    ("Al-Taleeq-Ur-Razavi-Alaa Saheeh-Ul-Bukhari", "al-taleeq-ur-razavi", "hadith", "Al Taleeq ur Razavi ala Sahih il Bukhari", "التعليق الرضوي على صحيح البخاري", "التعلیق الرضوی علیٰ صحیح البخاری", ["ar"]),
    ("Al-Zamzama-Tul-Qamariyya", "al-zamzama-tul-qamariyya", "rasail", "Al Zamzama tul Qamariyya", "الزمزمة القمرية في الذب عن الحمرة الغبرية", "الزمزمۃ القمریۃ فی الذب عن الحمرۃ الغبریۃ", ["ar"]),
    ("Alijazat-Ul-Mateena", "al-ijazat-ul-mateena", "rasail", "Al Ijazat ul Mateena li Ulama Bakkata wal Madeena", "الإجازات المتينة لعلماء بكة والمدينة", "الاجازات المتینۃ لعلماء بکۃ والمدینۃ", ["ar"]),
    ("Dus Aqeeday", "dus-aqeeday", "aqaid", "Dus Aqeeday", "عشر عقائد", "دس عقیدے", ["ur"]),
    ("Eedain-Me-Gale-Milna", "eedain-me-gale-milna", "fatawa", "Eedain Me Gale Milna", "المعانقة في العيدين", "عیدین میں گلے ملنا", ["ar", "ur"]),
    ("Eimaan-Ki-Pehchan", "eimaan-ki-pehchan", "aqaid", "Eimaan Ki Pehchan", "معرفة الإيمان", "ایمان کی پہچان", ["ur"]),
    ("Faizan e Ilm o Ulama", "faizan-e-ilm-o-ulama", "rasail", "Faizan e Ilm o Ulama", "فيضان العلم والعلماء", "فیضانِ علم و علماء", ["ur"]),
    ("Fazail-e-Duaa", "fazail-e-duaa", "durood", "Fazail e Duaa", "فضائل الدعاء", "فضائلِ دعا", ["ar", "ur"]),
    ("Iqamat-Ul-Qiyyamat", "iqamat-ul-qiyamat", "aqaid", "Iqamat ul Qiyamat ala Taan il Qiyam li Nabi Tihamat", "إقامة القيامة على طاعن القيام لنبي تهامة", "اقامۃ القیامۃ علیٰ طاعن القیام لنبی تہامۃ", ["ar", "ur"]),
    ("Izhar-Ul-Haq-Al-Jalee", "izhar-ul-haq-al-jali", "aqaid", "Izhar ul Haq al Jali", "إظهار الحق الجلي", "اظہار الحق الجلی", ["ur"]),
    ("Kiflul-Faqeeh", "kifl-ul-faqeeh", "fatawa", "Kifl ul Faqeeh il Fahim fi Ahkam i Qirtas id Darahim", "كفل الفقيه الفاهم في أحكام قرطاس الدراهم", "کفل الفقیہ الفاھم فی احکام قرطاس الدراھم", ["ar"]),
    ("Kiflul-Faqeeh-Urdu", "kifl-ul-faqeeh-urdu", "fatawa", "Kifl ul Faqeeh il Fahim (Urdu Translation)", "كفل الفقيه الفاهم (ترجمة أردية)", "کفل الفقیہ الفاھم (اردو ترجمہ)", ["ur", "ar"]),
    ("Malfoozat-e-Aala-Hazrat", "malfoozat-e-aala-hazrat", "rasail", "Malfoozat e Aala Hazrat", "ملفوظات أعلى حضرت", "ملفوظاتِ اعلیٰ حضرت", ["ur"]),
    ("Olaad-k-Huqooq", "olaad-ke-huqooq", "fatawa", "Olaad ke Huqooq", "حقوق الأولاد", "اولاد کے حقوق", ["ur"]),
    ("Ourtain-Aur-Mazarat-Ki-Haziri", "auratain-aur-mazarat-ki-haziri", "fatawa", "Auratain aur Mazarat ki Haziri", "النساء وزيارة المزارات", "عورتیں اور مزارات کی حاضری", ["ur"]),
    ("Rahy-Khuda-Mai-Khrj-Kar-Ny-Ky-Fazail", "rah-e-khuda-me-kharch-ke-fazail", "fatawa", "Rah e Khuda me Kharch karne ke Fazail", "فضائل الإنفاق في سبيل الله", "راہِ خدا میں خرچ کرنے کے فضائل", ["ur"]),
    ("Shriat-o-Tariqat", "shariat-o-tariqat", "tasawwuf", "Shariat o Tariqat", "الشريعة والطريقة", "شریعت و طریقت", ["ur"]),
    ("Suboot-e-Hilaal-k-Tareeqay", "suboot-e-hilal-ke-tareeqay", "fatawa", "Suboot e Hilal ke Tareeqay", "طرق ثبوت الهلال", "ثبوتِ ہلال کے طریقے", ["ur", "ar"]),
    ("Waliden-Zoujen-Aur-Asaatiza-k-Huqooq", "walidain-zaujain-asatiza-ke-huqooq", "fatawa", "Walidain, Zaujain aur Asatiza ke Huqooq", "حقوق الوالدين والزوجين والأساتذة", "والدین، زوجین اور اساتذہ کے حقوق", ["ur", "ar"]),
    ("Wilayat ka Aasan Rasta Tasawwur-e-Shaikh", "wilayat-ka-aasan-rasta", "tasawwuf", "Wilayat ka Aasan Rasta (Tasawwur e Shaikh)", "الطريق السهل إلى الولاية (تصور الشيخ)", "ولایت کا آسان راستہ (تصورِ شیخ)", ["ur"]),
    ("al-wazifa tul karima", "al-wazifa-tul-karima", "durood", "Al Wazifa tul Karima", "الوظيفة الكريمة", "الوظیفۃ الکریمہ", ["ur", "ar"]),
    ("huqoq ul ibad kesay maaf hon", "huqooq-ul-ibad-kaise-maaf-hon", "fatawa", "Huqooq ul Ibad Kaise Maaf Hon", "كيف تُعفى حقوق العباد", "حقوق العباد کیسے معاف ہوں", ["ur"]),
    ("isma-e-arbaeen", "isma-e-arbaeen", "fatawa", "Isma e Arbaeen", "اسماء الأربعين", "اسماءِ اربعین", ["ur"]),
    ("tamheed-ul-eeman", "tamheed-ul-eeman", "aqaid", "Tamheed ul Eeman bi Ayat il Quran", "تمهيد الإيمان بآيات القرآن", "تمہیدِ ایمان بآیاتِ قرآن", ["ar", "ur"]),
]
BULK_KEYS = []
for _f, _slug, _cat, _en, _ar, _ur, _langs in _BULK:
    _k = "b-" + _slug
    BULK_KEYS.append(_k)
    BOOKS[_k] = dict(
        dir=f"{BULK_DIR}/{_f}", author=BULK_AUTHOR, category=_cat, volumes=None, demote_hadith=False, media=True, demote_collisions=True,
        book=dict(slug=_slug, titleEn=_en, titleAr=_ar, titleUr=_ur, languages=json.dumps(_langs), published=1),
    )

NO_VOLUME = ""  # pseudo volume slug of volume-less books (out/<book>/_/, chapters.volumeId = NULL)


def folder_number(name: str) -> int | None:
    """'Miraat-ul-Manajeh-jild-1' / 'Jild 7 ' / 'si-raat-ul-jinan-jild-10' -> int."""
    m = re.search(r"(\d+)\s*$", name)
    return int(m.group(1)) if m else None


def volume_folders(book: str, data_root: Path = DATA_ROOT) -> dict[str, Path]:
    """slug -> folder, validated against the expected volume list of the book."""
    cfg = BOOKS[book]
    base = data_root / cfg["dir"]
    if cfg["volumes"] is None:
        return {NO_VOLUME: base}
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
    if BOOKS[book]["volumes"] is None:
        return [NO_VOLUME]
    return [str(n) for n in BOOKS[book]["volumes"]]


def out_dir(book: str) -> Path:
    return API_DIR / "scripts" / "out" / BOOKS[book]["book"]["slug"]
