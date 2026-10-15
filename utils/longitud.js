/**
 * Tope DURO de palabras para los largos. Pedir "14-16 minutes" no bastaba:
 * la IA escribía ~45% más (≈20 min y 17.894 caracteres de ElevenLabs el 29/09).
 * El tope sale del máximo de minutos a 130 palabras/min; con la voz del canal
 * eso queda por debajo del máximo pedido, nunca por encima.
 */
const PALABRAS_POR_MINUTO = 130;

/** "6-8 minutes" → 1040. Sin minutos (los Shorts van en segundos) → null. */
function topePalabras(etiqueta = '') {
  const m = String(etiqueta || '').match(/(\d+)(?:\s*-\s*(\d+))?\s*min/i);
  if (!m) return null;
  return Number(m[2] || m[1]) * PALABRAS_POR_MINUTO;
}

function cuentaPalabras(texto) {
  const plano = Array.isArray(texto) ? texto.join(' ') : String(texto ?? '');
  return plano.split(/\s+/).filter(Boolean).length;
}

/** Quita secciones del final hasta que todo (fijo + secciones) quepa; deja al menos una. */
function recortaSecciones(secciones, tope, palabrasFijas = 0) {
  if (!tope) return secciones;
  const out = [...secciones];
  const total = () => palabrasFijas + out.reduce((n, s) => n + cuentaPalabras(s.content), 0);
  while (out.length > 1 && total() > tope) out.pop();
  return out;
}

module.exports = { topePalabras, cuentaPalabras, recortaSecciones, PALABRAS_POR_MINUTO };
