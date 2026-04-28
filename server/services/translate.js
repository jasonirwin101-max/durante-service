/**
 * Spanish detection and translation service.
 * Uses MyMemory free API (no key required, 5000 words/day, 500 chars/request).
 */

const SPANISH_INDICATORS = ['ñ', 'á', 'é', 'í', 'ó', 'ú', '¿', '¡'];

// Common Spanish stems and short words. Far more aggressive than the
// original list so two-word notes like "Necesitar ayuda" or "Prueba este"
// trigger detection.
const SPANISH_STEMS = new Set([
  // articles, prepositions, conjunctions, pronouns
  'que', 'con', 'del', 'una', 'uno', 'unos', 'unas', 'para', 'como', 'esta', 'este', 'esto', 'estos', 'esas', 'esos', 'esa', 'ese',
  'mas', 'los', 'las', 'por', 'fue', 'son', 'hay', 'ser', 'estar', 'tener', 'todo', 'pero', 'muy', 'bien', 'mal',
  'puede', 'hace', 'tambien', 'también', 'despues', 'después', 'porque', 'sobre', 'antes', 'cuando', 'donde', 'aunque', 'mientras',
  'yo', 'tu', 'tú', 'el', 'él', 'ella', 'nosotros', 'ellos', 'ellas', 'mi', 'mis', 'su', 'sus', 'nuestro', 'nuestra',
  'aqui', 'aquí', 'alli', 'allí', 'ahora', 'siempre', 'nunca', 'ya', 'aun', 'aún',
  // pivotal short verbs
  'tiene', 'tiene', 'tenia', 'tenía', 'voy', 'vamos', 'va', 'iba', 'sera', 'será', 'fue', 'fueron',
  'soy', 'eres', 'es', 'somos', 'son', 'era', 'eran',
  // numerals/qualifiers
  'primer', 'primera', 'segundo', 'segunda', 'tercer', 'tercera',
  // domain — equipment / service
  'problema', 'equipo', 'motor', 'aceite', 'bomba', 'valvula', 'válvula', 'manguera',
  'filtro', 'presion', 'presión', 'cilindro', 'hidraulico', 'hidráulico', 'electrico', 'eléctrico',
  'bateria', 'batería', 'tornillo', 'tuerca', 'cable', 'fuga', 'rota', 'roto', 'dañado', 'dañada', 'gastado',
  'maquina', 'máquina', 'parte', 'pieza', 'repuesto',
  // domain verbs / states
  'funciona', 'funcionando', 'completado', 'terminado', 'reparo', 'reparó', 'reparar', 'repare', 'reparé',
  'reemplazo', 'reemplazó', 'reemplazar', 'reemplace', 'reemplacé',
  'cambio', 'cambió', 'cambiar', 'cambie', 'cambié',
  'arreglo', 'arregló', 'arreglar', 'arregle', 'arreglé',
  'reviso', 'revisó', 'revisar', 'revise', 'revisé',
  'instalo', 'instaló', 'instalar', 'instale', 'instalé',
  'examino', 'examinó', 'examinar', 'examine', 'examiné',
  'detecto', 'detectó', 'detectar', 'detecte', 'detecté',
  'inspecciono', 'inspeccionó', 'inspeccionar', 'inspeccione', 'inspeccioné',
  'completar', 'completó', 'complete', 'completé',
  'terminar', 'terminó', 'termine', 'terminé',
  'necesita', 'necesitar', 'necesito', 'necesite', 'necesidad',
  'ayuda', 'ayudar', 'ayudo', 'ayudó', 'ayude',
  'prueba', 'probar', 'probó', 'probado', 'probada',
  'examen', 'inspeccion', 'inspección',
  // common nouns
  'trabajo', 'cliente', 'tecnico', 'técnico', 'mecanico', 'mecánico', 'oficina',
  'sitio', 'lugar', 'tiempo', 'dia', 'día', 'hora', 'fecha',
  // descriptors
  'nuevo', 'nueva', 'viejo', 'vieja', 'usado', 'usada', 'listo', 'lista',
  'todos', 'todas', 'algun', 'algunos', 'cada', 'otro', 'otros', 'mismo', 'misma',
  'sí', 'no', 'tal', 'asi', 'así',
]);

// Spanish suffixes that strongly indicate Spanish even for words not in the stem list.
const SPANISH_ENDINGS = ['ado', 'ada', 'ido', 'ida', 'ndo', 'mente', 'ción', 'cion', 'sion', 'sión'];

function isSpanish(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (SPANISH_INDICATORS.some(c => lower.includes(c))) return true;

  const words = lower.split(/[\s.,;:!?()"'/\\-]+/).filter(Boolean);
  if (words.length === 0) return false;

  let matches = 0;
  for (const word of words) {
    if (SPANISH_STEMS.has(word)) { matches++; continue; }
    if (word.length >= 4 && SPANISH_ENDINGS.some(end => word.endsWith(end))) {
      matches++; continue;
    }
    // Spanish infinitives: 4+ char words ending in -ar, -er, -ir
    if (word.length >= 4 && /[aei]r$/.test(word)) {
      matches++; continue;
    }
  }
  const ratio = matches / words.length;
  return matches >= 2 || ratio >= 0.34;
}

// Module-wide rate limiter so MyMemory's free tier doesn't 429 us when two
// notes (customer + internal) translate back-to-back on the same status update.
let _lastCallAt = 0;
const MIN_GAP_MS = 500;

async function translateToEnglish(text) {
  if (!text || !text.trim()) return null;

  // MyMemory free tier caps at 500 chars per request.
  const truncated = text.length > 500 ? text.slice(0, 500) : text;
  if (truncated !== text) {
    console.warn(`[Translate] Text truncated from ${text.length} to 500 chars for MyMemory.`);
  }

  const since = Date.now() - _lastCallAt;
  if (since < MIN_GAP_MS) {
    await new Promise(r => setTimeout(r, MIN_GAP_MS - since));
  }
  _lastCallAt = Date.now();

  try {
    const encoded = encodeURIComponent(truncated);
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encoded}&langpair=es|en`
    );
    const data = await response.json();
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const translated = data.responseData.translatedText;
      console.log(`[Translate] MyMemory ok: "${truncated.substring(0, 60)}" → "${translated.substring(0, 60)}"`);
      return translated;
    }
    console.error('[Translate] MyMemory bad response:', data.responseStatus, data.responseDetails || '');
    return null;
  } catch (err) {
    console.error('[Translate] MyMemory failed:', err.message);
    return null;
  }
}

/**
 * Process tech notes — detect language, translate if Spanish.
 * Returns { text: string, original: string|null }
 *  - text: English (translated) or input verbatim if already English / translation failed
 *  - original: Spanish source text when a translation occurred, otherwise null
 */
async function processNotes(text) {
  if (!text || !text.trim()) return { text: text || '', original: null };
  if (!isSpanish(text)) {
    console.log(`[Translate] Not detected as Spanish, passing through: "${text.substring(0, 60)}"`);
    return { text, original: null };
  }

  console.log(`[Translate] Spanish detected: "${text.substring(0, 60)}"`);
  const translated = await translateToEnglish(text);
  if (translated) {
    return { text: translated, original: text };
  }

  // API failed — return original text and log it; the caller still gets usable output.
  console.warn(`[Translate] Translation failed, falling back to original Spanish: "${text.substring(0, 60)}"`);
  return { text, original: null };
}

module.exports = { isSpanish, translateToEnglish, processNotes };
