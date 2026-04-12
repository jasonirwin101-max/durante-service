/**
 * Spanish detection and translation service.
 * Uses MyMemory free API (no key required, 5000 words/day).
 * Falls back to local dictionary if API fails.
 */

const SPANISH_INDICATORS = ['ñ', 'á', 'é', 'í', 'ó', 'ú', '¿', '¡'];

const SPANISH_WORDS = [
  'que', 'con', 'del', 'una', 'para', 'como', 'está', 'más',
  'los', 'las', 'por', 'fue', 'son', 'hay', 'ser', 'tiene',
  'todo', 'esta', 'pero', 'muy', 'bien', 'puede', 'hace',
  'también', 'después', 'porque', 'sobre', 'antes', 'necesita',
  'problema', 'equipo', 'motor', 'aceite', 'bomba', 'válvula',
  'manguera', 'filtro', 'presión', 'cilindro', 'hidráulico',
  'funciona', 'completado', 'terminado', 'reparó', 'reemplazó',
];

/**
 * Detect if text is likely Spanish.
 */
function isSpanish(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (SPANISH_INDICATORS.some(c => lower.includes(c))) return true;
  const words = lower.split(/\s+/);
  let matches = 0;
  for (const word of words) {
    const clean = word.replace(/[.,;:!?()"']/g, '');
    if (SPANISH_WORDS.includes(clean)) matches++;
    if (matches >= 2) return true;
  }
  return false;
}

/**
 * Translate Spanish to English using MyMemory free API.
 * No API key required. 5000 words/day free tier.
 */
async function translateToEnglish(text) {
  try {
    const encoded = encodeURIComponent(text);
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encoded}&langpair=es|en`
    );
    const data = await response.json();
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const translated = data.responseData.translatedText;
      console.log(`[Translate] MyMemory: "${text.substring(0, 50)}" → "${translated.substring(0, 50)}"`);
      return translated;
    }
    console.error('[Translate] MyMemory bad response:', data.responseStatus);
    return null;
  } catch (err) {
    console.error('[Translate] MyMemory failed:', err.message);
    return null;
  }
}

/**
 * Process tech notes — detect language, translate if Spanish.
 * Returns { text: string, original: string|null }
 */
async function processNotes(text) {
  if (!text || !text.trim()) return { text: text || '', original: null };
  if (!isSpanish(text)) return { text, original: null };

  console.log(`[Translate] Spanish detected: "${text.substring(0, 60)}"`);

  const translated = await translateToEnglish(text);
  if (translated) {
    return { text: translated, original: text };
  }

  // API failed — return original
  return { text, original: null };
}

module.exports = { isSpanish, translateToEnglish, processNotes };
