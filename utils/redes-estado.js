/**
 * The panel's "Social" area (05/10/2026): status and settings of everything
 * that goes out on its own on Instagram and Facebook, plus the replies to the
 * Amén ones.
 * Each piece lives in settings (see the module that publishes it).
 */
const PIEZAS = [
  { id: 'oracion_fecha', nombre: 'Oración de la mañana con fecha', donde: 'Instagram + Facebook (imagen)', nombreEn: 'Dated morning prayer', dondeEn: 'Instagram + Facebook (image)', modulo: 'piezas-diarias',
    enabled: 'oracion_fecha_enabled', encendidaPorDefecto: true, hora: 'oracion_fecha_time', horaDefecto: '07:00', ultimo: 'oracion_fecha_last' },
  { id: 'oracion_corta', nombre: 'Oración del día («comenta Amén»)', donde: 'Instagram + Facebook (Reel)', nombreEn: 'Prayer of the day («comment Amén»)', dondeEn: 'Instagram + Facebook (Reel)', modulo: 'oracion-corta',
    enabled: 'oracion_corta_enabled', encendidaPorDefecto: true, hora: 'oracion_corta_time', horaDefecto: '09:00', ultimo: 'oracion_corta_last' },
  { id: 'carrusel', nombre: 'Carrusel de oraciones', donde: 'Instagram (carrusel) + Facebook (Reel)', nombreEn: 'Prayer carousel', dondeEn: 'Instagram (carousel) + Facebook (Reel)', modulo: 'carrusel-diario',
    enabled: 'instagram_carousel_enabled', encendidaPorDefecto: false, hora: 'instagram_carousel_time', horaDefecto: '12:00', ultimo: 'instagram_carousel_last' },
  { id: 'frase_compartir', nombre: 'Frase para compartir', donde: 'Instagram + Facebook (imagen)', nombreEn: 'Quote to share', dondeEn: 'Instagram + Facebook (image)', modulo: 'piezas-diarias',
    enabled: 'frase_compartir_enabled', encendidaPorDefecto: true, hora: 'frase_compartir_time', horaDefecto: '20:00', ultimo: 'frase_compartir_last' },
  { id: 'historia', nombre: 'Historia del vídeo de YouTube', donde: 'Facebook sola · Instagram la subes tú desde /historia', nombreEn: 'YouTube video story', dondeEn: 'Facebook on its own · Instagram you upload from /historia', modulo: 'historia-diaria',
    enabled: 'historia_diaria_enabled', encendidaPorDefecto: true },
  { id: 'amen', nombre: 'Respuestas automáticas a los «Amén»', donde: 'Instagram + Facebook (YouTube aparte)', nombreEn: 'Automatic replies to «Amén»', dondeEn: 'Instagram + Facebook (YouTube separately)', modulo: 'amen-automatico',
    enabled: 'amen_auto_enabled', encendidaPorDefecto: true },
  { id: 'privado', nombre: 'Oración por mensaje privado', donde: 'Instagram · al primer comentario de cada persona', nombreEn: 'Prayer by private message', dondeEn: "Instagram · on each person's first comment", modulo: 'mensaje-amen',
    enabled: 'dm_amen_enabled', encendidaPorDefecto: false },
  { id: 'amen_youtube', nombre: 'Responder «Amén» en YouTube', donde: 'YouTube, cada 30-90 min (gasta cuota de la API)', nombreEn: 'Reply to «Amén» on YouTube', dondeEn: 'YouTube, every 30-90 min (uses API quota)', modulo: 'amen-automatico',
    enabled: 'amen_youtube_enabled', encendidaPorDefecto: false }
];

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const json = (texto, defecto) => { try { return texto ? JSON.parse(texto) : defecto; } catch (_e) { return defecto; } };

function encendida(pieza, valor) {
  return pieza.encendidaPorDefecto ? valor !== 'false' : valor === 'true';
}

/** List for the panel: on/off, time, last result per network. */
async function estadoRedes(db) {
  const lista = [];
  for (const p of PIEZAS) {
    const item = { id: p.id, nombre: p.nombre, donde: p.donde, nombreEn: p.nombreEn, dondeEn: p.dondeEn, encendida: encendida(p, await db.getSetting(p.enabled)) };
    if (p.hora) item.hora = await db.getSetting(p.hora) || p.horaDefecto;
    if (p.ultimo) {
      const u = json(await db.getSetting(p.ultimo), {});
      item.ultimo = u.fecha ? { fecha: u.fecha, estado: u.status, redes: u.redes || {}, tema: u.tema || u.momento || null } : null;
    }
    if (p.id === 'historia') {
      const hechas = json(await db.getSetting('historia_hechas'), {});
      const [youtubeId, h] = Object.entries(hechas).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at)))[0] || [];
      item.ultimo = youtubeId ? { fecha: String(h.at).slice(0, 10), youtubeId, redes: { facebook: h.facebook, panel: h.panel, instagram: h.instagram } } : null;
      item.instagramAuto = await db.getSetting('historia_ig_auto') === 'true';
    }
    if (p.id === 'amen') {
      const dia = json(await db.getSetting('amen_dia'), {});
      item.hoy = dia.fecha === new Date().toISOString().slice(0, 10) ? dia.cuenta || 0 : 0;
      item.proxima = await db.getSetting('amen_proxima') || null;
      item.ultimas = json(await db.getSetting('amen_ultimas'), []).slice(0, 15);
      item.redesEstado = json(await db.getSetting('amen_redes'), null);
      item.pausas = json(await db.getSetting('amen_pausas'), {});
      // With the private message on, Instagram comments are handled by mensaje-amen (it's not "not connected").
      item.instagramPorPrivado = await db.getSetting('dm_amen_enabled') === 'true';
    }
    if (p.id === 'privado') {
      const e = json(await db.getSetting('dm_amen_estado'), {});
      const dia = json(await db.getSetting('dm_amen_dia'), {});
      item.hoy = dia.fecha === new Date().toISOString().slice(0, 10) ? dia.cuenta || 0 : 0;
      item.total = e.total || json(await db.getSetting('dm_amen_usuarios'), []).length;
      item.ultimoEnvio = e.ultimoEnvio || null;
      item.ultimoError = e.ultimoError || null;
      item.noContactar = json(await db.getSetting('dm_no_contactar'), []).length;
      item.borrados = json(await db.getSetting('borrado_solicitudes'), []).slice(0, 20);
      const b = json(await db.getSetting('borrado_estado'), {});
      item.borradoError = b.error || null;
      item.borradoRevisado = b.at || null;
    }
    lista.push(item);
  }
  return lista;
}

/** Turns a piece on/off or changes its time. Returns the error as text if something isn't valid. */
async function cambiaPieza(db, id, { encendida: on, hora } = {}) {
  const p = PIEZAS.find(x => x.id === id);
  if (!p) return { error: 'Pieza desconocida' };
  if (hora !== undefined) {
    if (!p.hora) return { error: 'Esta pieza no tiene hora' };
    if (!HORA.test(String(hora))) return { error: 'Hora no válida (HH:MM)' };
    await db.setSetting(p.hora, String(hora));
  }
  if (on !== undefined) await db.setSetting(p.enabled, on ? 'true' : 'false');
  return { ok: true };
}

module.exports = { PIEZAS, estadoRedes, cambiaPieza };
