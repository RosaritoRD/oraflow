/**
 * Long-video titles in the format of the niche's big channels (requested by the owner, 03/10/2026,
 * based on @AbrazoDivino and Sol Naciente):
 *
 *   ORACIÓN DE LA MAÑANA | EL SEÑOR ES MI LUZ Y MI SALVACIÓN: NO TEMAS LO QUE TRAIGA ESTE DÍA | Salmo 27
 *
 * A fixed header with the time of day the CONTENT says, the passage's promise and what the
 * listener receives in capitals, and the reference at the end as it's written.
 * 05/10/2026 (the owner): with the publishing DATE after the time of day, like the fastest-growing
 * competitor ("Oración de la mañana 5 de octubre de 2026"):
 *   ORACIÓN DE LA MAÑANA · 6 DE OCTUBRE | DIOS CUIDA DE TI: … | Isaías 26:3
 * People search for "today's" prayer with the date. No date if there's no publishing slot.
 * YouTube cuts at 100: the reference is sacrificed first, then it's cut at a word.
 */
const { tituloLimpio } = require('./titulo-limpio');
const { esShort } = require('./formato');

const MAX = 100;
const CABECERA = /^\s*ORACI[ÓO]N\s+DE\s+LA\s+(MAÑANA|MANANA|TARDE|NOCHE)(?:\s*[·•-]?\s*\d{1,2}\s+DE\s+\p{L}+(?:\s+DE\s+\d{4})?)?\s*(?:[|—–:·•-]\s*)*/iu;

/** «6 DE OCTUBRE» in the channel's time zone (the day it's published, not the day it's generated). */
function fechaTitulo(fecha, tz = 'America/New_York') {
  const d = fecha ? new Date(fecha) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', timeZone: tz }).format(d).toLocaleUpperCase('es');
}
// «| Salmo 27», «| Salmos 4:8», «| 1 Pedro 5:7», «| Proverbios 3:5-6» al final.
const CITA_FINAL = /\s*[|—–]\s*(?:[1-3]\s*)?\p{L}[\p{L}\s]{1,24}?\s+\d{1,3}(?::\d{1,3}(?:\s*[-–]\s*\d{1,3})?)?\s*$/u;

const sinEmojis = t => String(t || '').replace(/\p{Extended_Pictographic}|️|‍/gu, '').replace(/\s+/g, ' ').trim();

/** «Salmos 32:8» → «Salmo 32:8» (that's how the niche titles it). */
function citaDelTitulo(ref) {
  const r = sinEmojis(ref).replace(/^Salmos\b/i, 'Salmo');
  return r || null;
}

function cortaEnPalabra(t, max) {
  if ([...t].length <= max) return t;
  let c = [...t].slice(0, max + 1).join('');
  c = c.slice(0, Math.max(c.lastIndexOf(' '), 1));
  return c.replace(/[\s|—–:,;-]+$/u, '').trim();
}

function tituloEstiloOracion({ titulo = '', franja = null, referencia = null, fecha = null, tz } = {}) {
  let cuerpo = tituloLimpio(sinEmojis(titulo), { conservaMayusculas: true });
  const franjaTitulo = (cuerpo.match(CABECERA) || [])[1];
  const f = String(franja || franjaTitulo || 'MAÑANA').toUpperCase().replace('MANANA', 'MAÑANA');
  cuerpo = cuerpo.replace(CABECERA, '').replace(CITA_FINAL, '').replace(/^[\s|—–:-]+|[\s|—–:,-]+$/g, '').trim();
  cuerpo = cuerpo.toLocaleUpperCase('es');
  const dia = fechaTitulo(fecha, tz);
  const cabeza = `ORACIÓN DE LA ${f}${dia ? ` · ${dia}` : ''}`;
  if (!cuerpo) return cabeza;
  const cita = citaDelTitulo(referencia);
  const conCita = cita ? `${cabeza} | ${cuerpo} | ${cita}` : null;
  if (conCita && [...conCita].length <= MAX) return conCita;
  return cortaEnPalabra(`${cabeza} | ${cuerpo}`, MAX);
}

/** Only the Spanish prayer channel's long videos. */
function usaEstiloOracion(strategy = {}, env = process.env) {
  return /^es\b/i.test(String(env.CONTENT_LANGUAGE || '')) &&
    String(env.CHANNEL_THEME || '').toLowerCase() === 'prayer' &&
    !esShort(strategy);
}

module.exports = { tituloEstiloOracion, usaEstiloOracion, fechaTitulo };
