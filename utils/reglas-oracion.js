/**
 * Regla de fe del canal (el autor, 05/10/2026): TODAS las oraciones terminan en
 * «Amén» y hablan de Jesús de Nazaret como el Rey de reyes; Dios Padre y
 * Jesús son siempre los alabados.
 *
 * Se pide en el prompt (REGLA_FE) y además se garantiza al validar: si la IA
 * no nombra a Jesús como Rey, se añade el cierre "En el nombre de Jesús de
 * Nazaret, Rey de reyes", así que nunca sale una oración sin Él.
 */
const REGLA_FE = `- Toda oración nombra a Jesús de Nazaret y lo exalta como Rey de reyes y Señor de todo (por ejemplo: "en el nombre de Jesús de Nazaret, el Rey de reyes"). La alabanza y la gloria son siempre para Dios Padre y para Jesús, nunca para la persona ni para la cuenta.
- Toda oración termina con «Amén».`;

const CIERRE_JESUS = 'En el nombre de Jesús de Nazaret, Rey de reyes';

const nombraAJesusRey = texto => /jes[uú]s/i.test(texto) && /\brey\b/i.test(texto);
const sinAmen = texto => String(texto || '').replace(/\s+/g, ' ').trim().replace(/[\s.,;:!]*am[eé]n[.!]*$/i, '').trim();

const punto = t => (/[.!?…]$/.test(t) ? t : `${t}.`);

/** La oración sin «Amén» final, con Jesús nombrado como Rey (añade el cierre si falta). */
function conJesusRey(texto) {
  const base = punto(sinAmen(texto).replace(/[,;:\s]+$/, ''));
  return nombraAJesusRey(base) ? base : `${base} ${CIERRE_JESUS}.`;
}

/** La oración completa: Jesús como Rey + «Amén.» al final. */
const conAmen = texto => `${conJesusRey(texto)} Amén.`;

/**
 * Cierre de un guion hablado (vídeo largo o Short): si en todo el guion no se
 * nombra a Jesús como Rey, el cierre lo añade; y el cierre siempre acaba en «Amén.».
 */
function cierreDeGuion(conclusion, guionCompleto = '') {
  const base = String(conclusion || '').trim();
  if (!base) return `${CIERRE_JESUS}. Amén.`;
  if (!nombraAJesusRey(`${guionCompleto} ${base}`)) return conAmen(base);
  return /am[eé]n[.!]*$/i.test(base) ? base : `${punto(base.replace(/[,;:\s]+$/, ''))} Amén.`;
}

module.exports = { REGLA_FE, CIERRE_JESUS, nombraAJesusRey, sinAmen, conJesusRey, conAmen, cierreDeGuion };
