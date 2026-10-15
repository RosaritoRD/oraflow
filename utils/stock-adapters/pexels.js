const { requestJSON, orientationMatches, tokens } = require('./media');

const LICENSE = 'https://www.pexels.com/license/';

function parsePexelsPhotos(payload, { orientation = 'landscape' } = {}) {
  return (Array.isArray(payload?.photos) ? payload.photos : []).flatMap(photo => {
    if (!photo || typeof photo !== 'object') return [];
    const url = photo.src?.original || photo.src?.large2x || photo.src?.large;
    if (!photo.id || !url || !orientationMatches(photo.width, photo.height, orientation)) return [];
    const title = photo.alt || `Photo by ${photo.photographer || 'Pexels'}`;
    return [{ id: `pexels_image_${photo.id}`, source: 'pexels', type: 'image', title, url,
      previewUrl: photo.src?.medium || photo.src?.small || url, width: Number(photo.width) || null, height: Number(photo.height) || null,
      durationSec: null, license: LICENSE, keywords: [...tokens(title)], downloadable: true,
      attribution: { name: photo.photographer || '', url: photo.photographer_url || '', assetUrl: photo.url || '', provider: 'Pexels' }, raw: photo }];
  });
}

function parsePexelsVideos(payload, { orientation = 'landscape', minDurationSec = 5 } = {}) {
  return (Array.isArray(payload?.videos) ? payload.videos : []).flatMap(video => {
    if (!video || typeof video !== 'object') return [];
    if (!video.id || !(Number(video.duration) >= minDurationSec) || !orientationMatches(video.width, video.height, orientation)) return [];
    const files = (Array.isArray(video.video_files) ? video.video_files : []).filter(file => file?.file_type === 'video/mp4' && file.link && file.width > 0 && file.height > 0);
    // Prefer full HD while avoiding a 4K download when HD is available.
    files.sort((a, b) => Math.abs(Math.max(a.width, a.height) - 1920) - Math.abs(Math.max(b.width, b.height) - 1920));
    const file = files[0];
    if (!file) return [];
    const slug = (video.url || '').split('/').filter(Boolean).pop()?.replace(/-\d+$/, '').replace(/-/g, ' ');
    const title = video.title || video.alt || (slug && !/^\d+$/.test(slug) ? slug : `Video by ${video.user?.name || 'Pexels'}`);
    const tags = (Array.isArray(video.tags) ? video.tags : []).flatMap(tag => [...tokens(typeof tag === 'string' ? tag : tag?.title)]);
    return [{ id: `pexels_video_${video.id}`, source: 'pexels', type: 'video', title, url: file.link,
      previewUrl: video.image || null, width: Number(file.width), height: Number(file.height), durationSec: Number(video.duration),
      license: LICENSE, keywords: [...new Set([...tokens(title), ...tags])], downloadable: true,
      attribution: { name: video.user?.name || '', url: video.user?.url || '', assetUrl: video.url || '', provider: 'Pexels' }, raw: video }];
  });
}

class PexelsAdapter {
  constructor({ apiKey = process.env.PEXELS_API_KEY, fetchImpl = globalThis.fetch, logger = console } = {}) {
    this.source = 'pexels'; this.apiKey = apiKey; this.fetchImpl = fetchImpl; this.logger = logger;
  }
  async isAvailable() { return Boolean(this.apiKey); }
  async search({ queries = [], preferredAssetType = 'image', orientation = 'landscape', minDurationSec = 5, limit = 8 } = {}) {
    if (!this.apiKey) return [];
    const types = preferredAssetType === 'video' ? ['video', 'image'] : ['image', 'video'];
    const jobs = queries.slice(0, 3).flatMap(query => types.map(async type => {
      const url = new URL(type === 'video' ? 'https://api.pexels.com/v1/videos/search' : 'https://api.pexels.com/v1/search');
      url.searchParams.set('query', query);
      url.searchParams.set('orientation', orientation);
      url.searchParams.set('per_page', String(Math.min(80, Math.max(1, limit))));
      const data = await requestJSON(url.href, { headers: { Authorization: this.apiKey }, fetchImpl: this.fetchImpl });
      return type === 'video' ? parsePexelsVideos(data, { orientation, minDurationSec }) : parsePexelsPhotos(data, { orientation });
    }));
    const results = await Promise.allSettled(jobs);
    if (results.some(result => result.status === 'rejected')) this.logger.warn?.('One or more Pexels searches failed; using remaining stock sources');
    return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  }
}

module.exports = { PexelsAdapter, parsePexelsPhotos, parsePexelsVideos };
