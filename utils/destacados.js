/**
 * Videos recommended in the descriptions (05/10/2026, modeled on a large prayer
 * channel): at the top "¡Te invitamos a ver la siguiente oración!" with the
 * most-watched long video, and in the footer "Tienes que ver este vídeo" with
 * the most-watched Short. YouTube renders those links as video cards.
 * Setting `videos_destacados` = { invita: {id,url,titulo}, ver: {…}, at }.
 */
const esShort = segundos => segundos > 0 && segundos <= 180;

/** "PT7M3S" → 423 */
function duracionSegundos(iso = '') {
  const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0) : 0;
}

/** From the list of public videos ({id, titulo, vistas, segundos}) it picks the most-watched long video and Short. */
function eligeDestacados(videos) {
  const orden = l => [...l].sort((a, b) => b.vistas - a.vistas)[0] || null;
  const enlace = v => (v ? { id: v.id, url: `https://www.youtube.com/watch?v=${v.id}`, titulo: v.titulo } : null);
  return {
    invita: enlace(orden(videos.filter(v => !esShort(v.segundos)))),
    ver: enlace(orden(videos.filter(v => esShort(v.segundos))))
  };
}

/** Reads the channel (YouTube Data API) and stores the featured ones. ~2 units per 50 videos. */
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
