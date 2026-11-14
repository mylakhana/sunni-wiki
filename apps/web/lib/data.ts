/* Mock data for the prototype. Replace with real API (apps/api) later. */
export type Category = { id: string; en: string; ar: string; ur: string; desc: string }
export type Author = { id: string; name: string; ar: string; ur: string; years: string; color: string; bio: string }
/** [English, Arabic, Urdu] chapter title */
export type ChapterTitle = [string, string, string]
export type Book = {
  id: string; title: string; ar: string; ur: string; author: string; cat: string
  langs: string[]; volumes: number; added: string; hue: [string, string]; blurb: string
  pool: ChapterTitle[]
}
export type Chapter = { id: string; n: number; en: string; ar: string; ur: string }
export type Volume = { n: number; chapters: Chapter[] }
export type Block =
  | { t: "h" | "sh" | "p" | "ar" | "ur" | "note"; x: string }
  | { t: "verse"; kind: string; ref: string; ar: string; ur: string; en: string }
  | { t: "table"; head: string[]; rows: string[][] }

export const CATEGORIES: Category[] = [
  { id: 'fiqh', en: 'Fiqh', ar: 'الفقه', ur: 'فقہ', desc: 'Rulings for worship and daily life' },
  { id: 'hadith', en: 'Hadith', ar: 'الحديث', ur: 'حدیث', desc: 'Sayings of the Prophet ﷺ' },
  { id: 'aqidah', en: 'Beliefs', ar: 'العقيدة', ur: 'عقائد', desc: 'The foundations of faith' },
  { id: 'tasawwuf', en: 'Spirituality', ar: 'التصوف', ur: 'تصوف', desc: 'Purifying the heart' },
  { id: 'seerah', en: 'Seerah & Praise', ar: 'السيرة', ur: 'سیرت', desc: 'Life and praise of the Prophet ﷺ' },
];

export const AUTHORS: Author[] = [
  { id: 'ahmad-raza', name: 'Imam Ahmad Raza Khan', ar: 'أحمد رضا خان', ur: 'امام احمد رضا خان', years: '1856 – 1921', color: '#0f6b57',
    bio: 'A renowned scholar of the Indian subcontinent, known as Ala Hazrat. He wrote on many subjects including Islamic law, belief and love of the Prophet ﷺ.' },
  { id: 'nawawi', name: 'Imam an-Nawawi', ar: 'يحيى بن شرف النووي', ur: 'امام نووی', years: '1233 – 1277', color: '#7a4a1d',
    bio: 'A Syrian scholar of hadith and Shafi‘i law, loved for his clear and practical collections.' },
  { id: 'ghazali', name: 'Imam al-Ghazali', ar: 'أبو حامد الغزالي', ur: 'امام غزالی', years: '1058 – 1111', color: '#3b3f8f',
    bio: 'A scholar, jurist and teacher of the soul, remembered for his writings on purifying character.' },
  { id: 'bukhari', name: 'Imam al-Bukhari', ar: 'محمد بن إسماعيل البخاري', ur: 'امام بخاری', years: '810 – 870', color: '#1d5a7a',
    bio: 'The compiler of the most trusted collection of hadith, travelling widely to gather authentic narrations.' },
  { id: 'qadi-iyad', name: 'Qadi Iyad', ar: 'القاضي عياض', ur: 'قاضی عیاض', years: '1083 – 1149', color: '#8a2f4a',
    bio: 'A scholar of Andalusia and the Maghrib, famous for his work on the character and honour of the Prophet ﷺ.' },
  { id: 'busiri', name: 'Imam al-Busiri', ar: 'محمد بن سعيد البوصيري', ur: 'امام بوصیری', years: '1213 – 1294', color: '#5b6b1e',
    bio: 'An Egyptian poet whose famous ode in praise of the Prophet ﷺ is recited around the world.' },
  { id: 'naimi', name: 'Mufti Ahmad Yar Khan Naimi', ar: 'أحمد يار خان نعيمي', ur: 'مفتی احمد یار خان نعیمی', years: '1906 – 1971', color: '#a1561c',
    bio: 'A scholar and commentator who wrote in simple Urdu so that ordinary readers could benefit.' },
  { id: 'amjad-ali', name: 'Sadr al-Shariah Amjad Ali', ar: 'أمجد علي الأعظمي', ur: 'صدر الشریعہ امجد علی اعظمی', years: '1882 – 1947', color: '#2b6e8f',
    bio: 'A jurist who compiled a clear, step-by-step guide to everyday rulings for the Urdu reader.' },
];

/* pool = list of [English, Arabic, Urdu] chapter titles */
export const BOOKS: Book[] = [
  { id: 'fatawa-razawiyya', title: 'Fatawa Razawiyya', ar: 'الفتاوى الرضوية', ur: 'فتاویٰ رضویہ', author: 'ahmad-raza', cat: 'fiqh',
    langs: ['Arabic', 'Urdu'], volumes: 30, added: '2026-10-02', hue: ['#0f6b57', '#063b30'],
    blurb: 'A vast collection of answers to questions on worship, trade, family life and belief, explained with evidence.',
    pool: [
      ['Purification', 'كتاب الطهارة', 'کتاب الطہارت'], ['Ablution (Wudu)', 'باب الوضوء', 'وضو کا بیان'],
      ['Ritual Bath (Ghusl)', 'باب الغسل', 'غسل کا بیان'], ['Dry Ablution (Tayammum)', 'باب التيمم', 'تیمم کا بیان'],
      ['Prayer', 'كتاب الصلاة', 'کتاب الصلوٰۃ'], ['Funeral Prayer', 'باب الجنائز', 'جنازے کا بیان'],
      ['Zakat', 'كتاب الزكاة', 'کتاب الزکوٰۃ'], ['Fasting', 'كتاب الصوم', 'کتاب الصوم'],
      ['Pilgrimage (Hajj)', 'كتاب الحج', 'کتاب الحج'], ['Marriage', 'كتاب النكاح', 'کتاب النکاح'],
      ['Trade & Transactions', 'كتاب البيوع', 'کتاب البیوع'], ['Beliefs', 'كتاب العقائد', 'کتاب العقائد'] ] },

  { id: 'bahar-e-shariat', title: 'Bahar-e-Shariat', ar: 'بهار شريعت', ur: 'بہارِ شریعت', author: 'amjad-ali', cat: 'fiqh',
    langs: ['Urdu'], volumes: 3, added: '2026-09-18', hue: ['#2b6e8f', '#12384a'],
    blurb: 'A step-by-step guide to everyday Islamic rulings, written in clear and simple language.',
    pool: [
      ['Beliefs', 'العقائد', 'عقائد'], ['Purity', 'الطهارة', 'طہارت'], ['Prayer', 'الصلاة', 'نماز'], ['Zakat', 'الزكاة', 'زکوٰۃ'],
      ['Fasting', 'الصوم', 'روزہ'], ['Hajj', 'الحج', 'حج'], ['Marriage', 'النكاح', 'نکاح'], ['Trade', 'البيوع', 'خرید و فروخت'] ] },

  { id: 'sahih-bukhari', title: 'Sahih al-Bukhari', ar: 'صحيح البخاري', ur: 'صحیح بخاری', author: 'bukhari', cat: 'hadith',
    langs: ['Arabic', 'Urdu'], volumes: 9, added: '2026-08-21', hue: ['#1d5a7a', '#0b2c3d'],
    blurb: 'The most trusted collection of hadith, arranged by subject.',
    pool: [
      ['How Revelation Began', 'بدء الوحي', 'آغازِ وحی'], ['Faith', 'كتاب الإيمان', 'کتاب الایمان'], ['Knowledge', 'كتاب العلم', 'کتاب العلم'],
      ['Ablution', 'كتاب الوضوء', 'کتاب الوضو'], ['Prayer', 'كتاب الصلاة', 'کتاب الصلوٰۃ'], ['Zakat', 'كتاب الزكاة', 'کتاب الزکوٰۃ'],
      ['Hajj', 'كتاب الحج', 'کتاب الحج'], ['Fasting', 'كتاب الصوم', 'کتاب الصوم'] ] },

  { id: 'ihya-ulum', title: 'Revival of the Religious Sciences', ar: 'إحياء علوم الدين', ur: 'احیاء العلوم', author: 'ghazali', cat: 'tasawwuf',
    langs: ['Arabic', 'Urdu'], volumes: 4, added: '2026-07-30', hue: ['#3b3f8f', '#1a1c47'],
    blurb: 'A guide to worship, daily conduct, and cleansing the heart of harmful habits.',
    pool: [
      ['Knowledge', 'كتاب العلم', 'کتاب العلم'], ['Beliefs', 'قواعد العقائد', 'عقائد کے قواعد'], ['Purity', 'سر الطهارة', 'طہارت کا راز'],
      ['Prayer', 'أسرار الصلاة', 'نماز کے اسرار'], ['Gratitude & Patience', 'الصبر والشكر', 'صبر اور شکر'], ['Hope & Fear', 'الخوف والرجاء', 'خوف اور امید'],
      ['Love & Longing', 'المحبة والشوق', 'محبت اور شوق'], ['Remembrance of Death', 'ذكر الموت', 'موت کی یاد'] ] },

  { id: 'riyad-salihin', title: 'Gardens of the Righteous', ar: 'رياض الصالحين', ur: 'ریاض الصالحین', author: 'nawawi', cat: 'hadith',
    langs: ['Arabic', 'Urdu'], volumes: 0, added: '2026-10-28', hue: ['#7a4a1d', '#3b220a'],
    blurb: 'A beloved collection of hadith on character, sincerity and good deeds.',
    pool: [
      ['Sincerity', 'باب الإخلاص', 'اخلاص'], ['Repentance', 'باب التوبة', 'توبہ'], ['Patience', 'باب الصبر', 'صبر'],
      ['Truthfulness', 'باب الصدق', 'سچائی'], ['Awareness of Allah', 'باب المراقبة', 'اللہ کی نگرانی کا احساس'],
      ['Piety', 'باب التقوى', 'تقویٰ'], ['Certainty & Trust', 'باب اليقين والتوكل', 'یقین اور توکل'] ] },

  { id: 'ash-shifa', title: 'Ash-Shifa', ar: 'الشفا بتعريف حقوق المصطفى', ur: 'الشفاء', author: 'qadi-iyad', cat: 'seerah',
    langs: ['Arabic', 'Urdu'], volumes: 2, added: '2026-06-12', hue: ['#8a2f4a', '#42121f'],
    blurb: 'On the noble character, rights and honour of the Prophet ﷺ.',
    pool: [
      ['Love of the Prophet ﷺ', 'محبة النبي', 'محبتِ رسول'], ['His Noble Character', 'جميل أخلاقه', 'اخلاقِ کریمانہ'],
      ['His Miracles', 'معجزاته', 'معجزات'], ['His Rank with Allah', 'مكانته عند ربه', 'اللہ کے ہاں مقام'] ] },

  { id: 'qasida-burda', title: 'Qasida Burda', ar: 'القصيدة البردة', ur: 'قصیدہ بردہ', author: 'busiri', cat: 'seerah',
    langs: ['Arabic', 'Urdu'], volumes: 0, added: '2026-11-05', hue: ['#5b6b1e', '#2a3209'],
    blurb: 'The world-famous poem in praise of the Prophet ﷺ, with simple translation.',
    pool: [
      ['Longing & Love', 'في الغزل', 'شوق و محبت'], ['Warning Against the Ego', 'في التحذير من هوى النفس', 'نفس کی پیروی سے تنبیہ'],
      ['Praise of the Prophet ﷺ', 'في مدح النبي', 'مدحِ رسول'], ['His Blessed Birth', 'في مولده', 'میلادِ مبارک'],
      ['His Miracles', 'في معجزاته', 'معجزات'], ['The Noble Qur’an', 'في شرف القرآن', 'شانِ قرآن'],
      ['The Night Journey', 'في إسرائه ومعراجه', 'اسراء و معراج'], ['Seeking Intercession', 'في التوسل', 'وسیلہ و شفاعت'],
      ['Closing Prayer', 'في المناجاة', 'مناجات'] ] },

  { id: 'jaa-al-haqq', title: 'Jaa al-Haqq', ar: 'جاء الحق', ur: 'جاء الحق', author: 'naimi', cat: 'aqidah',
    langs: ['Urdu'], volumes: 2, added: '2026-05-04', hue: ['#a1561c', '#4d2508'],
    blurb: 'Clear answers on questions of belief, with evidence from the Qur’an and Sunnah.',
    pool: [
      ['The Unseen', 'علم الغيب', 'علمِ غیب'], ['Intercession', 'الشفاعة', 'شفاعت'], ['Seeking Means', 'التوسل', 'توسل'],
      ['Honouring the Prophet ﷺ', 'تعظيم النبي', 'تعظیمِ رسول'] ] },
];


export const authorOf = (book: Book) => AUTHORS.find((a) => a.id === book.author)!
export const catOf = (book: Book) => CATEGORIES.find((c) => c.id === book.cat)!
export const getBook = (id: string) => BOOKS.find((b) => b.id === id)
export const getAuthor = (id: string) => AUTHORS.find((a) => a.id === id)
export const booksByAuthor = (id: string) => BOOKS.filter((b) => b.author === id)
export const booksInCategory = (id: string) => BOOKS.filter((b) => b.cat === id)

export function buildVolumes(book: Book): Volume[] {
  const mk = (v: number, i: number, t: ChapterTitle): Chapter => ({ id: `${v}-${i + 1}`, n: i + 1, en: t[0], ar: t[1], ur: t[2] })
  if (!book.volumes) return [{ n: 1, chapters: book.pool.map((t, i) => mk(1, i, t)) }]
  const out: Volume[] = []
  for (let v = 1; v <= book.volumes; v++) {
    const chapters: Chapter[] = []
    for (let i = 0; i < 4; i++) chapters.push(mk(v, i, book.pool[((v - 1) * 4 + i) % book.pool.length]!))
    out.push({ n: v, chapters })
  }
  return out
}

/** Sample content for every chapter (placeholder until real text exists). */
export function buildContent(_book: Book, ch: Chapter): Block[] {
  return [
    { t: "sh", x: "Overview" },
    { t: "p", x: `This chapter explains “${ch.en}” in clear, simple steps. Read it slowly, and return to the sections below whenever you need a reminder.` },
    { t: "verse", kind: "Qur’an", ref: "Surah al-Baqarah 2:222",
      ar: "إِنَّ اللَّهَ يُحِبُّ التَّوَّابِينَ وَيُحِبُّ الْمُتَطَهِّرِينَ",
      ur: "بے شک اللہ بہت توبہ کرنے والوں اور خوب پاک رہنے والوں کو پسند فرماتا ہے۔",
      en: "Indeed, Allah loves those who repent and loves those who purify themselves." },
    { t: "h", x: "Key points at a glance" },
    { t: "table", head: ["Act", "Ruling", "Note"], rows: [
      ["Washing the face", "Fard (obligatory)", "From forehead to chin, ear to ear"],
      ["Washing the arms", "Fard (obligatory)", "Including the elbows"],
      ["Wiping the head", "Fard (obligatory)", "At least a quarter of the head"],
      ["Washing the feet", "Fard (obligatory)", "Including the ankles"],
      ["Using the miswak", "Sunnah", "Before starting the wudu"] ] },
    { t: "sh", x: "A question and its answer" },
    { t: "p", x: "Question: What should a person do if they are unsure about this ruling? Answer: They should ask a trusted scholar, and act on what is certain." },
    { t: "ur", x: "یہ ایک نمونہ عبارت ہے جو اردو متن کی ترتیب دکھانے کے لیے دی گئی ہے۔ پڑھنے والے اپنی سہولت کے مطابق حروف کا سائز بدل سکتے ہیں۔" },
    { t: "ar", x: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ وَالصَّلَاةُ وَالسَّلَامُ عَلَى سَيِّدِ الْمُرْسَلِينَ" },
    { t: "verse", kind: "Hadith", ref: "Sahih Muslim",
      ar: "الطُّهُورُ شَطْرُ الْإِيمَانِ", ur: "پاکیزگی آدھا ایمان ہے۔", en: "Purity is half of faith." },
    { t: "note", x: "Sample text only. Real chapter text will appear here." },
  ]
}

export function initials(name: string) {
  return name.replace(/^(Imam|Mufti|Qadi|Sadr al-Shariah)\s+/i, "").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
}
