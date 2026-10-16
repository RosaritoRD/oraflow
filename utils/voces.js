/**
 * Several voices for the videos (requested by the owner, 03/10/2026).
 *
 * ELEVENLABS_VOICE_IDS = a comma-separated list. Each video uses ONE, picked by its
 * id: the same video always sounds with the same voice, so a retry doesn't change
 * narrator or pay for the narration again (the audio cache is keyed by voice +
 * text). Without a list, ELEVENLABS_VOICE_ID as always.
 *
 * 07/10/2026 — voice calendar. The channel's numbers: Shorts with the voice the
 * channel was born with (deep, "El Faraón") perform best; the second male voice
 * somewhat less and the female one the least. The owner decided:
 *   ELEVENLABS_VOICE_PRINCIPAL   everything else
 *   ELEVENLABS_VOICE_SECUNDARIA  Tuesday, Thursday and Saturday, on the evening Short
 *   ELEVENLABS_VOICE_MUJER       the 1st and 15th of the month, on the long video
 * With PRINCIPAL set, the calendar rules and the list isn't used.
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

/** The video's date: the publishing one; otherwise, the one in its id (ms). */
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

/** The voice per the owner's calendar; null if there's no calendar. */
function vozDelCalendario(idVideo, env, { fecha = null, short = false } = {}) {
  const principal = String(env.ELEVENLABS_VOICE_PRINCIPAL || '').trim();
  if (!principal) return null;
  const secundaria = String(env.ELEVENLABS_VOICE_SECUNDARIA || '').trim();
  const mujer = String(env.ELEVENLABS_VOICE_MUJER || '').trim();
  const { fecha: f, conHora } = fechaDelVideo(idVideo, fecha);
  const { semana, dia, hora } = partesEnNuevaYork(f);
  if (mujer && !short && DIAS_MUJER.has(dia)) return mujer;
  if (secundaria && DIAS_SECUNDARIA.has(semana)) {
    // The evening Short; if the time isn't known, that day's long video.
    if (short && conHora && hora >= HORA_NOCHE) return secundaria;
    if (!short && !conHora) return secundaria;
  }
  return principal;
}

/** A video's voice: stable for the same id (and the same date). */
function vozPara(idVideo, env = process.env, opciones = {}) {
  const delCalendario = vozDelCalendario(idVideo, env, opciones);
  if (delCalendario) return delCalendario;
  const voces = listaDeVoces(env);
  if (!voces.length) return null;
  const h = crypto.createHash('sha1').update(String(idVideo ?? '')).digest();
  return voces[h.readUInt32BE(0) % voces.length];
}

module.exports = { listaDeVoces, vozPara, vozDelCalendario };
