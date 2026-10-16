/**
 * The YouTube API's daily quota (05-06/10/2026). It's 10,000 units a day and each
 * upload uses 1,600: if secondary tasks (replying «Amén», the channel comment,
 * featured videos) use it up, the day's video doesn't upload.
 * When YouTube says "quota", it notes until when to wait (the quota resets at
 * California midnight) and secondary tasks don't try until then.
 * Setting `youtube_cuota_hasta` (ISO).
 */
const esCuota = error => /quota|quotaExceeded|rateLimitExceeded/i.test(String(error?.message || error || ''));

/** Next midnight in America/Los_Angeles (+5 min of margin). */
function proximaRenovacion(now = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(now).map(p => [p.type, p.value]));
  const transcurrido = ((Number(partes.hour) % 24) * 3600 + Number(partes.minute) * 60 + Number(partes.second)) * 1000;
  return new Date(now.getTime() - transcurrido + 86400000 + 5 * 60000);
}

async function marcaAgotada(db, now = new Date()) {
  const hasta = proximaRenovacion(now).toISOString();
  await db.setSetting('youtube_cuota_hasta', hasta);
  return hasta;
}

async function agotada(db, now = new Date()) {
  const hasta = await db.getSetting('youtube_cuota_hasta');
  return Boolean(hasta) && Date.parse(hasta) > now.getTime();
}

module.exports = { esCuota, proximaRenovacion, marcaAgotada, agotada };
