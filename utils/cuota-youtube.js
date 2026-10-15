/**
 * Cuota diaria de la API de YouTube (05-06/10/2026). Son 10.000 unidades al día
 * y cada subida gasta 1.600: si las tareas secundarias (responder «Amén»,
 * comentario del canal, vídeos destacados) la agotan, el vídeo del día no sube.
 * Cuando YouTube dice "quota", se apunta hasta cuándo esperar (la cuota vuelve a
 * medianoche de California) y las tareas secundarias no lo intentan hasta entonces.
 * Setting `youtube_cuota_hasta` (ISO).
 */
const esCuota = error => /quota|quotaExceeded|rateLimitExceeded/i.test(String(error?.message || error || ''));

/** Próxima medianoche en America/Los_Angeles (+5 min de margen). */
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
