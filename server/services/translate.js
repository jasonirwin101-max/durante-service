/**
 * Spanish detection and translation service.
 * Uses LibreTranslate free API for translation.
 * Falls back gracefully — never blocks the main flow.
 */

const SPANISH_INDICATORS = [
  'ñ', 'á', 'é', 'í', 'ó', 'ú', '¿', '¡',
];

const SPANISH_WORDS = [
  'que', 'con', 'del', 'una', 'para', 'como', 'está', 'más',
  'los', 'las', 'por', 'fue', 'son', 'hay', 'ser', 'tiene',
  'todo', 'esta', 'pero', 'muy', 'bien', 'puede', 'hace',
  'otro', 'desde', 'donde', 'cuando', 'entre', 'nuevo',
  'también', 'después', 'porque', 'sobre', 'antes',
  'reemplazó', 'reparó', 'cambió', 'revisó', 'encontró',
  'problema', 'equipo', 'motor', 'aceite', 'bomba', 'válvula',
  'manguera', 'filtro', 'presión', 'cilindro', 'hidráulico',
  'funciona', 'necesita', 'completado', 'terminado',
];

/**
 * Detect if text is likely Spanish.
 * Returns true if Spanish characters or multiple Spanish words are found.
 */
function isSpanish(text) {
  if (!text) return false;
  const lower = text.toLowerCase();

  // Check for Spanish-specific characters
  if (SPANISH_INDICATORS.some(c => lower.includes(c))) return true;

  // Check for Spanish words (need at least 2 matches)
  const words = lower.split(/\s+/);
  let matches = 0;
  for (const word of words) {
    const clean = word.replace(/[.,;:!?()]/g, '');
    if (SPANISH_WORDS.includes(clean)) matches++;
    if (matches >= 2) return true;
  }

  return false;
}

/**
 * Translate text from Spanish to English using LibreTranslate.
 * Returns the translated text, or the original if translation fails.
 */
async function translateToEnglish(text) {
  if (!text) return text;

  try {
    const response = await fetch('https://libretranslate.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: 'es',
        target: 'en',
        format: 'text',
      }),
    });

    if (!response.ok) {
      console.error(`[Translate] API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`[Translate] "${text.substring(0, 50)}..." → "${(data.translatedText || '').substring(0, 50)}..."`);
    return data.translatedText || null;
  } catch (err) {
    console.error('[Translate] Failed:', err.message);
    return null;
  }
}

/**
 * Process tech notes — detect language, translate if Spanish.
 * Returns { text: string (English), original: string|null (Spanish if translated) }
 */
async function processNotes(text) {
  if (!text || !text.trim()) return { text: text || '', original: null };

  if (!isSpanish(text)) {
    return { text, original: null };
  }

  console.log(`[Translate] Spanish detected in: "${text.substring(0, 60)}..."`);
  const translated = await translateToEnglish(text);

  if (translated) {
    return { text: `${translated} [translated from: ${text}]`, original: text };
  }

  // Translation failed — return original with a note
  return { text, original: null };
}

module.exports = { isSpanish, translateToEnglish, processNotes };
