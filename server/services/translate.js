/**
 * Spanish detection and translation service.
 * Uses a local dictionary for common construction/service terms.
 * Falls back to Azure Translator API if AZURE_TRANSLATOR_KEY is configured.
 */

const SPANISH_INDICATORS = ['ñ', 'á', 'é', 'í', 'ó', 'ú', '¿', '¡'];

const SPANISH_WORDS = [
  'que', 'con', 'del', 'una', 'para', 'como', 'está', 'más',
  'los', 'las', 'por', 'fue', 'son', 'hay', 'ser', 'tiene',
  'todo', 'esta', 'pero', 'muy', 'bien', 'puede', 'hace',
  'también', 'después', 'porque', 'sobre', 'antes', 'necesita',
];

// ─── Construction/Service Dictionary ────────────────────────
const DICT = {
  // Verbs (past tense common in tech notes)
  'solucioné': 'I fixed', 'solucionó': 'fixed', 'arreglé': 'I repaired', 'arregló': 'repaired',
  'reemplacé': 'I replaced', 'reemplazó': 'replaced', 'reparé': 'I repaired', 'reparó': 'repaired',
  'cambié': 'I changed', 'cambió': 'changed', 'revisé': 'I checked', 'revisó': 'checked',
  'encontré': 'I found', 'encontró': 'found', 'ajusté': 'I adjusted', 'ajustó': 'adjusted',
  'limpié': 'I cleaned', 'limpió': 'cleaned', 'probé': 'I tested', 'probó': 'tested',
  'instalé': 'I installed', 'instaló': 'installed', 'conecté': 'I connected', 'conectó': 'connected',
  'desconecté': 'I disconnected', 'apagué': 'I turned off', 'encendí': 'I turned on',
  'verifiqué': 'I verified', 'verificó': 'verified', 'diagnostiqué': 'I diagnosed',
  'completé': 'I completed', 'terminé': 'I finished',
  // Present tense
  'funciona': 'works', 'necesita': 'needs', 'tiene': 'has', 'está': 'is',
  'falta': 'is missing', 'requiere': 'requires', 'trabaja': 'works',
  // Nouns — equipment
  'motor': 'engine', 'bomba': 'pump', 'válvula': 'valve', 'manguera': 'hose',
  'filtro': 'filter', 'cilindro': 'cylinder', 'sello': 'seal', 'empaque': 'gasket',
  'correa': 'belt', 'cadena': 'chain', 'rodamiento': 'bearing', 'engranaje': 'gear',
  'pistón': 'piston', 'eje': 'shaft', 'piñón': 'pinion', 'buje': 'bushing',
  'aceite': 'oil', 'grasa': 'grease', 'refrigerante': 'coolant', 'combustible': 'fuel',
  'batería': 'battery', 'alternador': 'alternator', 'arrancador': 'starter',
  'freno': 'brake', 'frenos': 'brakes', 'llanta': 'tire', 'llantas': 'tires',
  'oruga': 'track', 'orugas': 'tracks', 'tensor': 'tensioner',
  // Nouns — parts/systems
  'hidráulico': 'hydraulic', 'hidráulica': 'hydraulic', 'eléctrico': 'electrical',
  'neumático': 'pneumatic', 'presión': 'pressure', 'temperatura': 'temperature',
  'nivel': 'level', 'fluido': 'fluid', 'fuga': 'leak', 'fugas': 'leaks',
  'ruido': 'noise', 'vibración': 'vibration', 'desgaste': 'wear',
  'daño': 'damage', 'grieta': 'crack', 'corrosión': 'corrosion',
  // Nouns — general
  'equipo': 'equipment', 'máquina': 'machine', 'problema': 'problem', 'problemas': 'problems',
  'pieza': 'part', 'piezas': 'parts', 'parte': 'part', 'partes': 'parts',
  'herramienta': 'tool', 'trabajo': 'work', 'sitio': 'site', 'lugar': 'location',
  // Common phrases / connectors
  'el': 'the', 'la': 'the', 'los': 'the', 'las': 'the', 'un': 'a', 'una': 'a',
  'de': 'of', 'del': 'of the', 'en': 'on', 'con': 'with', 'sin': 'without',
  'por': 'for', 'para': 'for', 'y': 'and', 'o': 'or', 'no': 'no/not',
  'se': '', 'es': 'is', 'fue': 'was', 'hay': 'there is', 'son': 'are',
  'todo': 'all', 'bien': 'well', 'mal': 'badly', 'nuevo': 'new', 'nueva': 'new',
  'viejo': 'old', 'roto': 'broken', 'rota': 'broken', 'dañado': 'damaged', 'dañada': 'damaged',
  'bueno': 'good', 'buena': 'good', 'normal': 'normal', 'bajo': 'low', 'alto': 'high',
  'que': 'that', 'muy': 'very', 'más': 'more', 'pero': 'but', 'también': 'also',
  'después': 'after', 'antes': 'before', 'ahora': 'now', 'ya': 'already',
  'operando': 'operating', 'normalmente': 'normally', 'correctamente': 'correctly',
  'especificaciones': 'specifications', 'spec': 'spec',
};

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
    if (SPANISH_WORDS.includes(clean) || DICT[clean]) matches++;
    if (matches >= 2) return true;
  }
  return false;
}

/**
 * Translate using Azure Translator API (if configured).
 */
async function azureTranslate(text) {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  if (!key || !region) return null;

  try {
    const response = await fetch(
      'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=es&to=en',
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Ocp-Apim-Subscription-Region': region,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ text }]),
      }
    );
    if (!response.ok) {
      console.error(`[Translate] Azure error: ${response.status}`);
      return null;
    }
    const data = await response.json();
    const translated = data[0]?.translations?.[0]?.text;
    if (translated) {
      console.log(`[Translate] Azure: "${text.substring(0, 40)}..." → "${translated.substring(0, 40)}..."`);
    }
    return translated || null;
  } catch (err) {
    console.error('[Translate] Azure failed:', err.message);
    return null;
  }
}

/**
 * Translate using local dictionary (word-by-word with context).
 */
function dictionaryTranslate(text) {
  const words = text.split(/\s+/);
  const translated = words.map(word => {
    const punct = word.match(/[.,;:!?()"']+$/)?.[0] || '';
    const clean = word.replace(/[.,;:!?()"']+$/, '').toLowerCase();
    const eng = DICT[clean];
    if (eng !== undefined) return eng + punct;
    return word + punct;
  });
  const result = translated.join(' ').replace(/\s+/g, ' ').trim();
  console.log(`[Translate] Dictionary: "${text.substring(0, 40)}..." → "${result.substring(0, 40)}..."`);
  return result;
}

/**
 * Process tech notes — detect language, translate if Spanish.
 * Returns { text: string, original: string|null }
 */
async function processNotes(text) {
  if (!text || !text.trim()) return { text: text || '', original: null };
  if (!isSpanish(text)) return { text, original: null };

  console.log(`[Translate] Spanish detected: "${text.substring(0, 60)}"`);

  // Try Azure first (best quality)
  const azureResult = await azureTranslate(text);
  if (azureResult) {
    return { text: `${azureResult} [translated from: ${text}]`, original: text };
  }

  // Fallback to local dictionary
  const dictResult = dictionaryTranslate(text);
  return { text: `${dictResult} [translated from: ${text}]`, original: text };
}

module.exports = { isSpanish, processNotes, dictionaryTranslate, azureTranslate };
