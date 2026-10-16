/**
 * The channel's faith rule (the owner, 05/10/2026): ALL prayers end in «Amén»
 * and speak of Jesus of Nazareth as the King of kings; God the Father and Jesus
 * are always the ones praised.
 *
 * It's requested in the prompt (REGLA_FE) and also guaranteed on validation: if
 * the AI doesn't name Jesus as King, the closing "En el nombre de Jesús de
 * Nazaret, Rey de reyes" is added, so a prayer never goes out without Him.
 */
const REGLA_FE = `- Toda oración nombra a Jesús de Nazaret y lo exalta como Rey de reyes y Señor de todo (por ejemplo: "en el nombre de Jesús de Nazaret, el Rey de reyes"). La alabanza y la gloria son siempre para Dios Padre y para Jesús, nunca para la persona ni para la cuenta.
- Toda oración termina con «Amén».`;

const CIERRE_JESUS = 'En el nombre de Jesús de Nazaret, Rey de reyes';

const nombraAJesusRey = texto => /jes[uú]s/i.test(texto) && /\brey\b/i.test(texto);
const sinAmen = texto => String(texto || '').replace(/\s+/g, ' ').trim().replace(/[\s.,;:!]*am[eé]n[.!]*$/i, '').trim();

const punto = t => (/[.!?…]$/.test(t) ? t : `${t}.`);

/** The prayer without the final «Amén», with Jesus named as King (adds the closing if missing). */
function conJesusRey(texto) {
  const base = punto(sinAmen(texto).replace(/[,;:\s]+$/, ''));
  return nombraAJesusRey(base) ? base : `${base} ${CIERRE_JESUS}.`;
}

/** The full prayer: Jesus as King + «Amén.» at the end. */
const conAmen = texto => `${conJesusRey(texto)} Amén.`;

/**
 * Closing of a spoken script (long video or Short): if Jesus isn't named as King
 * anywhere in the script, the closing adds it; and the closing always ends in «Amén.».
 */
function cierreDeGuion(conclusion, guionCompleto = '') {
  const base = String(conclusion || '').trim();
  if (!base) return `${CIERRE_JESUS}. Amén.`;
  if (!nombraAJesusRey(`${guionCompleto} ${base}`)) return conAmen(base);
  return /am[eé]n[.!]*$/i.test(base) ? base : `${punto(base.replace(/[,;:\s]+$/, ''))} Amén.`;
}

module.exports = { REGLA_FE, CIERRE_JESUS, nombraAJesusRey, sinAmen, conJesusRey, conAmen, cierreDeGuion };
