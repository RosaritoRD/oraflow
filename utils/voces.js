/**
 * Varias voces para los vídeos (pedido del autor, 03/10/2026).
 *
 * ELEVENLABS_VOICE_IDS = lista separada por comas. Cada vídeo usa UNA, elegida
 * por su id: el mismo vídeo siempre suena con la misma voz, así un reintento
 * no cambia de narrador ni vuelve a pagar la narración (la caché de audio va
 * por voz + texto). Sin lista, ELEVENLABS_VOICE_ID como siempre.
 *
 * 07/10/2026 — calendario de voces. Los números del canal: los Shorts con la
 * voz con la que nació el canal (grave, "El Faraón") rinden más; la segunda voz
 * de hombre algo menos y la de mujer, la que menos. el autor decidió:
 *   ELEVENLABS_VOICE_PRINCIPAL   todo lo demás
 *   ELEVENLABS_VOICE_SECUNDARIA  martes, jueves y sábado, en el Short de la noche
 *   ELEVENLABS_VOICE_MUJER       días 1 y 15 del mes, en el vídeo largo
 * Con PRINCIPAL definida manda el calendario y la lista no se usa.
 */
const crypto = require('crypto');

const ZONA = 'America/New_York';
const DIAS_SECUNDARIA = new Set(['Tue', 'Thu', 'Sat']);
const DIAS_MUJER = new Set([1, 15]);
const HORA_NOCHE = 17;

function listaDeVoces(env = process.env) {
  const lista = String(env.ELEVENLABS_VOICE_IDS || '').split(',').map(v => v.trim()).filter(Boolean);
  const unicas = [...new Set(lista)];
  if (unicas.length) return unicas;
  return env.ELEVENLABS_VOICE_ID ? [String(env.ELEVENLABS_VOICE_ID).trim()] : [];
}

/** La fecha del vídeo: la de publicación; si no, la que lleva su id (ms). */
function fechaDelVideo(idVideo, fecha) {
  const f = fecha ? new Date(fecha) : null;
  if (f && !Number.isNaN(f.getTime())) return { fecha: f, conHora: true };
  if (/^\d{13}$/.test(String(idVideo || ''))) return { fecha: new Date(Number(idVideo)), conHora: false };
  return { fecha: new Date(), conHora: false };
}

function partesEnNuevaYork(fecha) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA, weekday: 'short', day: 'numeric', hour: 'numeric', hourCycle: 'h23'
  }).formatToParts(fecha).map(p => [p.type, p.value]));
  return { semana: partes.weekday, dia: Number(partes.day), hora: Number(partes.hour) };
}

/** La voz según el calendario del autor; null si no hay calendario. */
function vozDelCalendario(idVideo, env, { fecha = null, short = false } = {}) {
  const principal = String(env.ELEVENLABS_VOICE_PRINCIPAL || '').trim();
  if (!principal) return null;
  const secundaria = String(env.ELEVENLABS_VOICE_SECUNDARIA || '').trim();
  const mujer = String(env.ELEVENLABS_VOICE_MUJER || '').trim();
  const { fecha: f, conHora } = fechaDelVideo(idVideo, fecha);
  const { semana, dia, hora } = partesEnNuevaYork(f);
  if (mujer && !short && DIAS_MUJER.has(dia)) return mujer;
  if (secundaria && DIAS_SECUNDARIA.has(semana)) {
    // El Short de la noche; si no se sabe la hora, el largo de ese día.
    if (short && conHora && hora >= HORA_NOCHE) return secundaria;
    if (!short && !conHora) return secundaria;
  }
  return principal;
}

/** La voz de un vídeo: estable para el mismo id (y la misma fecha). */
function vozPara(idVideo, env = process.env, opciones = {}) {
  const delCalendario = vozDelCalendario(idVideo, env, opciones);
  if (delCalendario) return delCalendario;
  const voces = listaDeVoces(env);
  if (!voces.length) return null;
  const h = crypto.createHash('sha1').update(String(idVideo ?? '')).digest();
  return voces[h.readUInt32BE(0) % voces.length];
}

module.exports = { listaDeVoces, vozPara, vozDelCalendario };
