const QURAN_COM_URL = "https://api.quran.com/api/v4/chapters";
const ALQURAN_CLOUD_URL = "https://api.alquran.cloud/v1/surah";
const CACHE_KEY = "cf_surahs_v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function normalizeFromQuranCom(json) {
  // { chapters: [ { id, name_simple, name_arabic, verses_count, revelation_place, translated_name } ] }
  return json.chapters?.map((c) => ({
    id: Number(c.id),
    name_en: c.name_simple,
    name_ar: c.name_arabic, // on garde l'arabe dans name_ar pour cohérence avec ton app
    verses: Number(c.verses_count),
    revelation: c.revelation_place,
    translated_name: c?.translated_name?.name || c.name_simple,
  })) ?? [];
}

function normalizeFromAlQuranCloud(json) {
  // { data: [ { number, name (arabic), englishName, numberOfAyahs } ] }
  return json.data?.map((s) => ({
    id: Number(s.number),
    name_en: s.englishName,
    name_ar: s.name,
    verses: Number(s.numberOfAyahs),
    revelation: null,
    translated_name: s.englishName,
  })) ?? [];
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

async function fetchJson(url, { signal } = {}) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Récupère la liste des sourates (avec cache + fallback) */
export async function getAllSurahs({ signal } = {}) {
  const cached = loadCache();
  if (cached?.length) return cached;

  // 1) Quran.com
  try {
    const j = await fetchJson(QURAN_COM_URL, { signal });
    const list = normalizeFromQuranCom(j);
    if (list.length) {
      saveCache(list);
      return list;
    }
  } catch {}

  // 2) AlQuran Cloud (fallback)
  try {
    const j = await fetchJson(ALQURAN_CLOUD_URL, { signal });
    const list = normalizeFromAlQuranCloud(j);
    if (list.length) {
      saveCache(list);
      return list;
    }
  } catch {}

  // 3) Mini fallback statique minimum (id + noms principaux)
  const minimal = Array.from({ length: 114 }, (_, i) => ({
    id: i + 1,
    name_en: `Surah ${i + 1}`,
    name_ar: `سورة ${i + 1}`,
    verses: NaN,
    revelation: null,
    translated_name: `Surah ${i + 1}`,
  }));
  return minimal;
}
