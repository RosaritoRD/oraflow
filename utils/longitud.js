/**
 * HARD word cap for long videos. Asking for "14-16 minutes" wasn't enough: the AI
 * wrote ~45% more (≈20 min and 17,894 ElevenLabs characters on 29/09).
 * The cap comes from the maximum minutes at 130 words/min; with the channel's
 * voice that lands below the requested maximum, never above.
 */
const PALABRAS_POR_MINUTO = 130;

/** "6-8 minutes" → 1040. No minutes (Shorts go in seconds) → null. */
function topePalabras(etiqueta = '') {
  const m = String(etiqueta || '').match(/(\d+)(?:\s*-\s*(\d+))?\s*min/i);
  if (!m) return null;
  return Number(m[2] || m[1]) * PALABRAS_POR_MINUTO;
}

function cuentaPalabras(texto) {
  const plano = Array.isArray(texto) ? texto.join(' ') : String(texto ?? '');
  return plano.split(/\s+/).filter(Boolean).length;
}

/** Removes sections from the end until everything (fixed + sections) fits; keeps at least one. */
function recortaSecciones(secciones, tope, palabrasFijas = 0) {
  if (!tope) return secciones;
  const out = [...secciones];
  const total = () => palabrasFijas + out.reduce((n, s) => n + cuentaPalabras(s.content), 0);
  while (out.length > 1 && total() > tope) out.pop();
  return out;
}

module.exports = { topePalabras, cuentaPalabras, recortaSecciones, PALABRAS_POR_MINUTO };
