// Searches YouTube for videos that break their channel's average (Outliers tab).
// API quota: 100 per search + ~2 per distinct channel. Repeated searches come
// from a 6-hour in-memory cache.
'use strict';

const core = require('./outliers-core');

const API = 'https://www.googleapis.com/youtube/v3';
const CACHE_MS = 6 * 60 * 60 * 1000;
const UPLOADS_PER_CHANNEL = 30;

const chunks = (xs, n) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

class OutliersService {
  constructor({ apiKey = process.env.YOUTUBE_API_KEY, fetch = globalThis.fetch, now = Date.now, logger } = {}) {
    this.apiKey = apiKey;
    this.fetch = fetch;
    this.now = now;
    this.logger = logger;
    this.cache = new Map();
  }

  async call(path, params, meter) {
    meter.quota += path === 'search' ? 100 : 1;
    const res = await this.fetch(`${API}/${path}?${new URLSearchParams({ ...params, key: this.apiKey })}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = json.error?.errors?.[0]?.reason || json.error?.message || res.statusText;
      throw Object.assign(new Error(`YouTube rejected the search: ${reason}`), { status: 502 });
    }
    return json;
  }

  async videos(ids, meter) {
    const out = [];
    for (const c of chunks(ids, 50)) {
      out.push(...(await this.call('videos', { part: 'snippet,statistics,contentDetails', id: c.join(',') }, meter)).items);
    }
    return out;
  }

  async search(rawQuery) {
    const opts = core.parseQuery(rawQuery);
    if (!this.apiKey) throw Object.assign(new Error('YOUTUBE_API_KEY is missing from the container .env'), { status: 503 });

    const cacheKey = JSON.stringify({ ...opts, query: opts.query.toLowerCase() });
    const hit = this.cache.get(cacheKey);
    if (hit && this.now() - hit.at < CACHE_MS) return { ...hit.result, cached: true };

    const meter = { quota: 0 };
    const now = this.now();
    const found = await this.call('search', {
      part: 'id', type: 'video', q: opts.query, maxResults: 50, order: 'relevance',
      relevanceLanguage: opts.lang, regionCode: opts.region,
      publishedAfter: new Date(now - opts.dias * 86_400_000).toISOString(),
      ...(opts.tipo === 'short' ? { videoDuration: 'short' } : {})
    }, meter);
    const videos = (await this.videos(found.items.map(i => i.id.videoId), meter)).filter(v => {
      const s = core.isoSeconds(v.contentDetails.duration) ?? 0;
      if (opts.tipo === 'largo') return s > 180;
      if (opts.tipo === 'short') return s <= 180;
      return true;
    });

    // Each channel's latest videos to get its median
    const channels = new Map();
    for (const c of chunks([...new Set(videos.map(v => v.snippet.channelId))], 50)) {
      for (const ch of (await this.call('channels', { part: 'contentDetails,statistics', id: c.join(',') }, meter)).items) {
        channels.set(ch.id, { subs: Number(ch.statistics.subscriberCount || 0), playlist: ch.contentDetails.relatedPlaylists.uploads, uploads: [] });
      }
    }
    for (const ch of channels.values()) {
      try {
        const { items } = await this.call('playlistItems', { part: 'contentDetails', playlistId: ch.playlist, maxResults: UPLOADS_PER_CHANNEL }, meter);
        ch.uploads = (await this.videos(items.map(i => i.contentDetails.videoId), meter))
          .map(u => ({ id: u.id, views: Number(u.statistics.viewCount || 0), publishedAt: u.snippet.publishedAt }));
      } catch (error) {
        if (error.status === 502 && /quota/i.test(error.message)) throw error;
        this.logger?.warn?.(`outliers: channel without readable videos (${error.message})`);
      }
    }

    const rows = videos.map(v => {
      const ch = channels.get(v.snippet.channelId) || { subs: 0, uploads: [] };
      const views = Number(v.statistics.viewCount || 0);
      const baseline = core.channelBaseline(ch.uploads, v.id, now);
      return {
        id: v.id,
        title: core.decodeEntities(v.snippet.title),
        channel: core.decodeEntities(v.snippet.channelTitle),
        subs: ch.subs,
        views,
        baseline,
        score: core.outlierScore(views, baseline),
        seconds: core.isoSeconds(v.contentDetails.duration),
        publishedAt: v.snippet.publishedAt.slice(0, 10),
        thumbnail: v.snippet.thumbnails?.medium?.url || null,
        url: `https://youtu.be/${v.id}`
      };
    });

    const result = {
      ...opts,
      scanned: rows.length,
      quota: meter.quota,
      at: new Date(now).toISOString(),
      results: core.rankOutliers(rows, opts).slice(0, opts.top)
    };
    this.cache.set(cacheKey, { at: now, result });
    return result;
  }
}

module.exports = { OutliersService };
