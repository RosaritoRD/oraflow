/**
 * Comentario del canal en cada vídeo (30/09/2026): invita a suscribirse, a
 * escribir «Amén» y a compartir, para atraer público y comentarios.
 *
 * Se pone cuando el vídeo YA es público (los vídeos se suben programados en
 * privado y ahí YouTube no deja comentar). Una tarea cada 30 min recorre el
 * canal y comenta los públicos que aún no lo tienen; lo hecho queda en el
 * ajuste `comentarios_canal`. La API no permite FIJAR comentarios: eso, si se
 * quiere, se hace a mano desde YouTube Studio.
 */
const crypto = require('crypto');

const TEXTOS = {
  // 30/09: sin peticiones de oración ni "¿por quién quieres orar?": el canal no
  // hace oraciones personalizadas y no debe prometerlas.
  'long:mañana': [
    '🙏 Gracias por empezar el día orando con nosotros. Si esta oración te dio paz, suscríbete al canal y activa la campanita 🔔: cada mañana hay una oración nueva para comenzar el día con Dios.\n\nEscribe «Amén» si la recibes. ❤️',
    '☀️ Que Dios guíe cada paso de tu día. ¿Quieres una oración así cada mañana? Suscríbete al canal 🔔 y compártela con alguien que la necesite hoy.\n\n¿Desde qué ciudad o país oras con nosotros? Cuéntanos aquí abajo. 🌎',
    '🌅 Empezar el día con Dios lo cambia todo. Si te gustó esta oración, suscríbete 🔔 para orar juntos cada mañana.\n\nEscribe «Amén» y comparte este vídeo con alguien a quien quieras bendecir hoy. 🙏'
  ],
  'long:noche': [
    '🌙 Que descanses esta noche en la paz de Dios. Si esta oración te acompañó, suscríbete al canal y activa la campanita 🔔 para no perderte la oración de cada noche.\n\nEscribe «Amén» si la recibes. 🙏',
    '✨ Entrega tus cargas a Dios y duerme en paz. Suscríbete 🔔 para orar juntos cada noche, y comparte esta oración con alguien que esté pasando un momento difícil.\n\n¿Desde dónde nos acompañas esta noche? 🌎',
    '🌙 Antes de dormir, deja todo en manos de Dios. Si esta oración te dio descanso, suscríbete al canal 🔔: cada noche hay una oración nueva para ti.\n\nEscribe «Amén» si la recibes. 🙏'
  ],
  short: [
    '🙏 Si este minuto de oración tocó tu corazón, suscríbete al canal 🔔: cada día hay una oración nueva y completa para ti y tu familia.\n\nEscribe «Amén» si la recibes. ❤️',
    '🔔 ¿Quieres orar así cada día? Suscríbete y encontrarás en el canal la oración completa de la mañana y de la noche.\n\nEscribe «Amén» si esta oración es para ti. 🙏',
    '❤️ Comparte esta oración con alguien que la necesite hoy y suscríbete 🔔 para recibir una oración nueva cada día.\n\n¿Desde qué país nos escuchas? Escríbelo aquí abajo. 🌎'
  ]
};

const MAX_INTENTOS = 3;
const AJUSTE = 'comentarios_canal';

/** "PT7M2S" → 422 segundos. */
function segundos(iso = '') {
  const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
}

function tipoDeVideo(v) {
  const titulo = v.snippet?.title || '';
  const dura = segundos(v.contentDetails?.duration);
  const formato = /#shorts?\b/i.test(`${titulo} ${v.snippet?.description || ''}`) || (dura > 0 && dura <= 180) ? 'short' : 'long';
  const franja = /noche|dormir|descansa/i.test(titulo) ? 'noche' : 'mañana';
  return { formato, franja };
}

/** Texto para un vídeo: elegido por su id, así cada vídeo lleva uno y no todos el mismo. */
function textoComentario({ videoId, formato, franja }) {
  const lista = formato === 'short' ? TEXTOS.short : TEXTOS[`long:${franja}`] || TEXTOS['long:mañana'];
  const h = parseInt(crypto.createHash('sha1').update(String(videoId)).digest('hex').slice(0, 8), 16);
  return lista[h % lista.length];
}

async function idsDelCanal(youtube) {
  const canal = (await youtube.channels.list({ part: 'contentDetails', mine: true })).data.items?.[0];
  const lista = canal?.contentDetails?.relatedPlaylists?.uploads;
  if (!lista) return [];
  const ids = [];
  let pageToken;
  do {
    const r = await youtube.playlistItems.list({ part: 'contentDetails', playlistId: lista, maxResults: 50, pageToken });
    ids.push(...(r.data.items || []).map(i => i.contentDetails.videoId));
    pageToken = r.data.nextPageToken;
  } while (pageToken);
  return ids;
}

async function comentaPublicados({ youtube, db, logger = console }) {
  let estado = {};
  try { estado = JSON.parse((await db.getSetting(AJUSTE)) || '{}'); } catch { estado = {}; }
  const guarda = () => db.setSetting(AJUSTE, JSON.stringify(estado), 'Comentario del canal puesto en cada vídeo público');

  const ids = (await idsDelCanal(youtube)).filter(id => !estado[id]?.commentId && (estado[id]?.intentos || 0) < MAX_INTENTOS);
  let nuevos = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const videos = (await youtube.videos.list({ part: 'snippet,status,contentDetails', id: ids.slice(i, i + 50).join(',') })).data.items || [];
    for (const v of videos) {
      if (v.status?.privacyStatus !== 'public') continue;
      const textOriginal = textoComentario({ videoId: v.id, ...tipoDeVideo(v) });
      try {
        const r = await youtube.commentThreads.insert({
          part: 'snippet',
          requestBody: { snippet: { videoId: v.id, topLevelComment: { snippet: { textOriginal } } } }
        });
        estado[v.id] = { commentId: r.data.id, en: new Date().toISOString() };
        nuevos += 1;
        logger.info(`Comentario del canal puesto en ${v.id}`);
      } catch (error) {
        const intentos = (estado[v.id]?.intentos || 0) + 1;
        estado[v.id] = { error: error.message, intentos };
        logger.warn(`No se pudo comentar ${v.id} (intento ${intentos}/${MAX_INTENTOS}): ${error.message}`);
      }
      await guarda();
    }
  }
  return { nuevos };
}

module.exports = { textoComentario, tipoDeVideo, comentaPublicados, TEXTOS, segundos };
