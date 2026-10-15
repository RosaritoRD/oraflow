const { requestJSON, orientationMatches, tokens, safeRemoteUrl } = require('./media');

const LICENSES = new Set(['Standard', 'Extended', 'Video_HD', 'Video_4K', 'Standard_M']);

function licensedUrl(file) {
  if (!LICENSES.has(file.is_licensed)) return null;
  const value = file.licensed_url || file.licenses?.[file.is_licensed]?.url;
  const previews = [file.comp_url, file.video_preview_url, file.video_small_preview_url,
    ...Object.entries(file).filter(([key]) => /^thumbnail.*_url$/.test(key)).map(([, url]) => url),
    ...Object.values(file.comps || {}).map(comp => comp?.url)];
  if (!value || previews.includes(value) || /watermarked|\/comp[s]?\//i.test(value)) return null;
  try { return safeRemoteUrl(value, 'adobe_stock').href; } catch { return null; }
}

function parseAdobeResponse(payload, { freeOnly = true, downloadableOnly = false, orientation = 'landscape', minDurationSec = 5 } = {}) {
  return (Array.isArray(payload?.files) ? payload.files : []).flatMap(file => {
    if (!file || typeof file !== 'object') return [];
    if (!file.id || (freeOnly && Number(file.premium_level_id) !== 1)) return [];
    const type = Number(file.media_type_id) === 4 ? 'video' : [1, 2].includes(Number(file.media_type_id)) ? 'image' : null;
    const durationSec = type === 'video' ? Number(file.duration) / 1000 : null;
    if (!type || !orientationMatches(file.width, file.height, orientation) || (type === 'video' && !(durationSec >= minDurationSec))) return [];
    const url = licensedUrl(file);
    if (downloadableOnly && !url) return [];
    const keywords = (Array.isArray(file.keywords) ? file.keywords : []).flatMap(word => [...tokens(typeof word === 'string' ? word : word?.name)]);
    return [{ id: `adobe_stock_${file.id}`, source: 'adobe_stock', type, title: file.title || `Adobe Stock ${file.id}`, url,
      previewUrl: file.thumbnail_url || file.comp_url || file.video_preview_url || null,
      width: Number(file.width) || null, height: Number(file.height) || null, durationSec,
      license: url ? `Adobe Stock ${file.is_licensed}` : null, keywords, downloadable: Boolean(url),
      attribution: { name: file.creator_name || '', assetUrl: file.details_url || `https://stock.adobe.com/images/${file.id}`, provider: 'Adobe Stock' }, raw: file }];
  });
}

class AdobeStockAdapter {
  constructor({ apiKey = process.env.ADOBE_STOCK_API_KEY, accessToken = process.env.ADOBE_STOCK_ACCESS_TOKEN,
    product = process.env.ADOBE_STOCK_PRODUCT || 'Oraflow/2.10.0', fetchImpl = globalThis.fetch, logger = console } = {}) {
    this.source = 'adobe_stock'; this.apiKey = apiKey; this.accessToken = accessToken; this.product = product; this.fetchImpl = fetchImpl; this.logger = logger;
  }
  async isAvailable() { return Boolean(this.apiKey); }
  headers() {
    return { 'x-api-key': this.apiKey, 'x-product': this.product, ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}) };
  }
  async search({ queries = [], preferredAssetType = 'image', orientation = 'landscape', minDurationSec = 5, limit = 8 } = {}) {
    if (!this.apiKey) return [];
    const results = await Promise.allSettled(queries.slice(0, 3).map(async query => {
      const url = new URL('https://stock.adobe.io/Rest/Media/1/Search/Files');
      url.searchParams.set('search_parameters[words]', query);
      url.searchParams.set('search_parameters[limit]', String(Math.min(100, Math.max(1, limit))));
      url.searchParams.set('search_parameters[filters][premium]', 'false');
      url.searchParams.set('search_parameters[filters][orientation]', ({ landscape: 'horizontal', portrait: 'vertical', square: 'square' })[orientation] || 'all');
      for (const type of ['photo', 'illustration', 'vector', 'video', 'template', '3d']) {
        url.searchParams.set(`search_parameters[filters][content_type:${type}]`, (preferredAssetType === 'video' ? type === 'video' : ['photo', 'illustration'].includes(type)) ? '1' : '0');
      }
      const columns = ['id', 'title', 'width', 'height', 'media_type_id', 'duration', 'premium_level_id', 'thumbnail_url', 'keywords', 'creator_name', 'details_url'];
      if (this.accessToken) columns.push('is_licensed', 'licenses');
      columns.forEach(column => url.searchParams.append('result_columns[]', column));
      const payload = await requestJSON(url.href, { headers: this.headers(), fetchImpl: this.fetchImpl });
      // premium=false includes PAID core assets. Only level 1 is free.
      // Adobe usually omits free content from Search; never substitute paid previews.
      const assets = parseAdobeResponse(payload, { freeOnly: true, orientation, minDurationSec });
      if (!this.accessToken) return assets;
      return Promise.all(assets.map(async asset => {
        if (asset.downloadable || !LICENSES.has(asset.raw.is_licensed)) return asset;
        try {
          const infoUrl = new URL('https://stock.adobe.io/Rest/Libraries/1/Content/Info');
          infoUrl.searchParams.set('content_id', String(asset.raw.id));
          infoUrl.searchParams.set('license', asset.raw.is_licensed);
          // Info is read-only. Content/License is deliberately never called.
          const info = await requestJSON(infoUrl.href, { headers: this.headers(), fetchImpl: this.fetchImpl });
          const purchase = info.contents?.[asset.raw.id]?.purchase_details;
          if (purchase?.state !== 'purchased' || !LICENSES.has(purchase.license)) return asset;
          return parseAdobeResponse({ files: [{ ...asset.raw, is_licensed: purchase.license, licensed_url: purchase.url }] }, { orientation, minDurationSec })[0] || asset;
        } catch { return asset; }
      }));
    }));
    if (results.some(result => result.status === 'rejected')) this.logger.warn?.('Adobe Stock search unavailable; using remaining stock sources');
    return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  }
  resolveDownload(asset) {
    if (Number(asset.raw?.premium_level_id) !== 1 || !asset.downloadable || licensedUrl(asset.raw) !== asset.url) throw new Error('Adobe asset needs an existing free-content license and original download URL');
    const url = safeRemoteUrl(asset.url, this.source);
    if (/\/Rest\/Libraries\/Download\//i.test(url.pathname)) {
      if (!this.accessToken) throw new Error('Adobe original download requires an access token');
      url.searchParams.set('token', this.accessToken);
    }
    return { url: url.href };
  }
}

module.exports = { AdobeStockAdapter, parseAdobeResponse, licensedUrl };
