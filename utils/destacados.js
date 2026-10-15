/**
 * Vídeos que se recomiendan en las descripciones (05/10/2026, modelo de Juan
 * Carlos Harrigan): arriba "¡Te invitamos a ver la siguiente oración!" con el
 * largo más visto, y en el pie "Tienes que ver este vídeo" con el Short más
 * visto. YouTube pinta esos enlaces como tarjetas del vídeo.
 * Setting `videos_destacados` = { invita: {id,url,titulo}, ver: {…}, at }.
 */
const esShort = segundos => segundos > 0 && segundos <= 180;

/** "PT7M3S" → 423 */
function duracionSegundos(iso = '') {
  const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0) : 0;
}

/** De la lista de vídeos públicos ({id, titulo, vistas, segundos}) elige el largo y el Short más vistos. */
function eligeDestacados(videos) {
  const orden = l => [...l].sort((a, b) => b.vistas - a.vistas)[0] || null;
  const enlace = v => (v ? { id: v.id, url: `https://www.youtube.com/watch?v=${v.id}`, titulo: v.titulo } : null);
  return {
    invita: enlace(orden(videos.filter(v => !esShort(v.segundos)))),
    ver: enlace(orden(videos.filter(v => esShort(v.segundos))))
  };
}

/** Lee el canal (YouTube Data API) y guarda los destacados. ~2 unidades por 50 vídeos. */
async function actualizaDestacados({ youtube, db, now = new Date() }) {
  const canal = (await youtube.channels.list({ part: ['contentDetails'], mine: true })).data.items?.[0];
  if (!canal) return null;
  const ids = [];
  let page;
  do {
    const r = (await youtube.playlistItems.list({ part: ['contentDetails'], playlistId: canal.contentDetails.relatedPlaylists.uploads, maxResults: 50, pageToken: page })).data;
    ids.push(...(r.items || []).map(i => i.contentDetails.videoId));
    page = r.nextPageToken;
  } while (page && ids.length < 300);
  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = (await youtube.videos.list({ part: ['snippet', 'statistics', 'contentDetails', 'status'], id: ids.slice(i, i + 50) })).data;
    for (const v of r.items || []) {
      if (v.status?.privacyStatus !== 'public') continue;
      videos.push({ id: v.id, titulo: v.snippet.title, vistas: Number(v.statistics?.viewCount || 0), segundos: duracionSegundos(v.contentDetails?.duration) });
    }
  }
  const destacados = { ...eligeDestacados(videos), at: now.toISOString() };
  await db.setSetting('videos_destacados', JSON.stringify(destacados));
  return destacados;
}

module.exports = { duracionSegundos, eligeDestacados, actualizaDestacados };
