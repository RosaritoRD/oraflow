// Pure logic for the Outliers tab: videos that beat their channel's median by a wide margin.
// Score = the video's views / median of the channel's latest videos.
'use strict';

const DAY = 86_400_000;
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const TIPOS = ['todos', 'largo', 'short'];

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function outlierScore(views, baseline) {
  return baseline ? views / baseline : null;
}

// "PT1H2M3S" / "P1DT1S" → segundos
function isoSeconds(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(iso));
  if (!m) return null;
  const [, d, h, min, s] = m.map(x => Number(x) || 0);
  return d * 86400 + h * 3600 + min * 60 + s;
}

// The channel's median without the video itself or the ones that haven't matured yet.
function channelBaseline(uploads, excludeId, now, { minAgeDays = 7, minVideos = 2 } = {}) {
  const views = uploads
    .filter(u => u.id !== excludeId && now - Date.parse(u.publishedAt) >= minAgeDays * DAY)
    .map(u => u.views);
  return views.length >= minVideos ? median(views) : null;
}

function rankOutliers(rows, { minScore = 0, minViews = 0 } = {}) {
  return rows
    .filter(r => r.score != null && r.score >= minScore && (r.views ?? 0) >= minViews)
    .sort((a, b) => b.score - a.score);
}

const ENTITIES = { amp: '&', quot: '"', lt: '<', gt: '>', apos: "'" };
function decodeEntities(s) {
  return String(s).replace(/&(#\d+|amp|quot|lt|gt|apos);/g, (_, e) =>
    e[0] === '#' ? String.fromCharCode(Number(e.slice(1))) : ENTITIES[e]);
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

const clamp = (v, min, max, def) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' && v != null ? Math.min(Math.max(n, min), max) : def;
};

// URL parameters → validated options
function parseQuery(q = {}) {
  const query = String(q.q || '').trim().replace(/\s+/g, ' ');
  if (query.length < 2 || query.length > 120) throw badRequest('Escribe un tema de 2 a 120 letras');
  const lang = String(q.lang || 'en').toLowerCase();
  if (!LANGS.includes(lang)) throw badRequest(`Ese idioma no está disponible (${LANGS.join(', ')})`);
  const region = String(q.region || 'US').toUpperCase();
  if (!/^[A-Z]{2}$/.test(region)) throw badRequest('La región son 2 letras, por ejemplo US');
  const tipo = String(q.tipo || 'todos');
  if (!TIPOS.includes(tipo)) throw badRequest('El tipo es todos, largo o short');
  return {
    query, lang, region, tipo,
    dias: Math.round(clamp(q.dias, 7, 730, 180)),
    minScore: clamp(q.min, 0, 1000, 3),
    minViews: Math.round(clamp(q.minvistas, 0, 1e9, 1000)),
    top: Math.round(clamp(q.top, 1, 50, 20))
  };
}

module.exports = { median, outlierScore, isoSeconds, channelBaseline, rankOutliers, decodeEntities, parseQuery, LANGS, TIPOS };
