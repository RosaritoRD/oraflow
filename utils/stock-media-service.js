const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { PexelsAdapter } = require('./stock-adapters/pexels');
const { AdobeStockAdapter, licensedUrl } = require('./stock-adapters/adobe-stock');
const { LocalAdapter } = require('./stock-adapters/local');
const media = require('./stock-adapters/media');
const { guardaFicha } = require('./biblioteca-stock');

function hammingDistance(a, b) {
  if (!/^[a-f\d]{16}$/i.test(a || '') || !/^[a-f\d]{16}$/i.test(b || '')) return Infinity;
  let value = BigInt(`0x${a}`) ^ BigInt(`0x${b}`), distance = 0;
  while (value) { distance += 1; value &= value - 1n; }
  return distance;
}

function dedupeAssets(assets, { excludeIds = new Set(), hashThreshold = 5 } = {}) {
  const ids = new Set(excludeIds), hashes = [], result = [];
  for (const asset of assets || []) {
    if (!asset?.id || ids.has(asset.id)) continue;
    ids.add(asset.id);
    const hash = asset.perceptualHash;
    // Constant dHashes cannot distinguish unrelated blank skies or gradients.
    const usefulHash = /^[a-f\d]{16}$/i.test(hash || '') && !/^(0{16}|f{16})$/i.test(hash);
    if (usefulHash && hashes.some(other => hammingDistance(other, hash) <= hashThreshold)) continue;
    if (usefulHash) hashes.push(hash);
    result.push(asset);
  }
  return result;
}

function scoreAsset(asset = {}, { visualIntent = '', sceneQueries = [], usedIds = new Set(), aspectRatio = '16:9' } = {}) {
  const queries = Array.isArray(sceneQueries) ? sceneQueries.join(' ') : String(sceneQueries || '');
  const wanted = media.tokens(`${visualIntent} ${queries}`);
  const keywords = Array.isArray(asset.keywords) ? asset.keywords : [];
  const actual = media.tokens(`${asset.title || ''} ${keywords.map(word => typeof word === 'string' ? word : word?.name || '').join(' ')}`);
  const hits = [...wanted].filter(word => actual.has(word)).length;
  const semantic = wanted.size ? 45 * hits / wanted.size : 0;
  const width = Number.isFinite(Number(asset.width)) ? Number(asset.width) : 0;
  const height = Number.isFinite(Number(asset.height)) ? Number(asset.height) : 0;
  const quality = width > 0 && height > 0 ? 20 * Math.min(1, Math.min(width, height) / 1080, Math.max(width, height) / 1920) : 0;
  const motion = asset.type === 'video' ? 15 : asset.type === 'image' ? 8 : 0;
  const uniqueness = new Set(usedIds || []).has(asset.id) ? 0 : 10;
  const parts = String(aspectRatio).split(':').map(Number);
  const requestedRatio = parts.length === 2 && parts[0] > 0 && parts[1] > 0 ? parts[0] / parts[1] : Number(aspectRatio);
  const target = Number.isFinite(requestedRatio) && requestedRatio > 0 ? requestedRatio : 16 / 9;
  const ratio = width > 0 && height > 0 ? 10 * Math.min(width / height / target, target / (width / height)) : 0;
  return Math.round(Math.max(0, Math.min(100, semantic + quality + motion + uniqueness + ratio)));
}

class StockMediaService {
  constructor({ logger = console, cacheDir, adapters, fetchImpl = globalThis.fetch, probeMedia = media.probeMedia, hashMedia = media.hashMedia } = {}) {
    this.logger = logger;
    this.cacheDir = path.resolve(cacheDir || process.env.STOCK_CACHE_DIR || path.join(__dirname, '..', 'data', 'assets', 'stock'));
    this.fetchImpl = fetchImpl; this.probeMedia = probeMedia; this.hashMedia = hashMedia;
    this.adapters = adapters || [new PexelsAdapter({ fetchImpl, logger }), new AdobeStockAdapter({ fetchImpl, logger }), new LocalAdapter({ probeMedia })];
    this.hashes = new Map(); this.downloads = new Map(); this.searchCache = new Map();
  }

  async isAvailable() {
    const results = await Promise.allSettled(this.adapters.map(async adapter => adapter.isAvailable()));
    return results.some(result => result.status === 'fulfilled' && result.value);
  }

  async listLocal() {
    const adapter = this.adapters.find(item => item.source === 'local');
    return adapter ? adapter.search({ limit: 100 }) : [];
  }

  async search({ queries = [], preferredAssetType = 'image', orientation = 'landscape', minDurationSec = 5, excludeIds = new Set(), limit = 8 } = {}) {
    limit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 8)));
    queries = [...new Set((Array.isArray(queries) ? queries : [queries]).map(query => String(query || '').trim().slice(0, 300)).filter(Boolean))].slice(0, 3);
    const options = { queries, preferredAssetType, orientation, minDurationSec: Math.max(0, Number(minDurationSec) || 0), limit: Math.min(100, limit * 2) };
    const results = await Promise.allSettled(this.adapters.map(async adapter => {
      if (!(await adapter.isAvailable())) return [];
      const key = `${adapter.source}:${JSON.stringify(options)}`;
      const cached = this.searchCache.get(key);
      if (cached && cached.expires > Date.now()) return cached.assets;
      const assets = await adapter.search(options);
      this.searchCache.set(key, { assets, expires: Date.now() + (adapter.source === 'local' ? 10000 : 300000) });
      if (this.searchCache.size > 100) this.searchCache.delete(this.searchCache.keys().next().value);
      return assets;
    }));
    results.forEach((result, index) => { if (result.status === 'rejected') this.logger.warn?.(`Stock source ${this.adapters[index].source || 'unknown'} unavailable; continuing with other sources`); });
    const all = results.flatMap(result => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : [])
      .filter(asset => asset?.url && asset.downloadable !== false
        && media.orientationMatches(asset.width, asset.height, orientation)
        && (asset.type !== 'video' || Number(asset.durationSec) >= options.minDurationSec)
        && (asset.source !== 'adobe_stock' || (asset.downloadable === true && Number(asset.raw?.premium_level_id) === 1 && licensedUrl(asset.raw) === asset.url)));
    const aspectRatio = orientation === 'portrait' ? '9:16' : orientation === 'square' ? '1:1' : '16:9';
    all.sort((a, b) => this.score(b, { sceneQueries: queries, aspectRatio }) - this.score(a, { sceneQueries: queries, aspectRatio }) || Number(b.type === preferredAssetType) - Number(a.type === preferredAssetType));
    const candidates = dedupeAssets(all, { excludeIds }).slice(0, limit * 3);
    // Small thumbnails suffice for dHash. Bound concurrency and tolerate unavailable previews.
    for (let i = 0; i < candidates.length; i += 4) await Promise.all(candidates.slice(i, i + 4).map(asset => this.fingerprint(asset)));
    return dedupeAssets(candidates, { excludeIds }).slice(0, limit);
  }

  async fingerprint(asset) {
    const key = `${asset.id}:${asset.previewUrl || asset.url}:${asset.source === 'local' ? `${asset.raw?.size}:${asset.raw?.mtimeMs}` : ''}`;
    if (this.hashes.has(key)) { asset.perceptualHash = this.hashes.get(key); return; }
    try {
      let hash;
      if (asset.source === 'local') {
        const adapter = this.adapters.find(item => item.source === 'local');
        const resolved = adapter?.resolveDownload ? await adapter.resolveDownload(asset) : { file: asset.url };
        hash = await this.hashMedia(resolved.file);
      } else if (asset.previewUrl) {
        const bytes = await media.downloadBuffer(asset.previewUrl, asset.source, { fetchImpl: this.fetchImpl });
        hash = await media.hashImageBuffer(bytes);
      }
      if (hash) { asset.perceptualHash = hash; this.hashes.set(key, hash); }
      if (this.hashes.size > 1000) this.hashes.delete(this.hashes.keys().next().value);
    } catch { /* Preview retrieval or decoding never blocks playable media. */ }
  }

  score(asset, context) { return scoreAsset(asset, context); }

  /** Record to reuse the clip in other videos (utils/biblioteca-stock.js). Never blocks the download. */
  async fichaBiblioteca(cachePath, asset) {
    if (asset.source === 'local') return;
    await guardaFicha(cachePath, asset).catch(error => this.logger.warn?.(`Stock library card failed: ${error.message}`));
  }

  async download(asset, outDir = this.cacheDir) {
    if (!asset?.id || !['image', 'video'].includes(asset.type) || !['local', 'pexels', 'adobe_stock'].includes(asset.source)) throw new Error('Invalid stock asset');
    if (asset.downloadable === false || !asset.url) throw new Error('Stock asset is a preview, not licensed downloadable media');
    if (asset.source === 'adobe_stock' && (asset.downloadable !== true || Number(asset.raw?.premium_level_id) !== 1 || licensedUrl(asset.raw) !== asset.url)) throw new Error('Adobe preview or paid asset cannot be used in production');
    const id = crypto.createHash('sha256').update(`${asset.source}:${asset.id}`).digest('hex');
    const cachePath = path.join(this.cacheDir, `${id}${media.mediaExtension(asset)}`);
    if (!this.downloads.has(cachePath)) this.downloads.set(cachePath, this.cacheAsset(asset, cachePath).finally(() => this.downloads.delete(cachePath)));
    await this.downloads.get(cachePath);
    const directory = path.resolve(outDir || this.cacheDir);
    if (directory === this.cacheDir) return cachePath;
    await fs.mkdir(directory, { recursive: true });
    const target = path.join(directory, path.basename(cachePath));
    const temporary = `${target}.${crypto.randomUUID()}.part`;
    try { await fs.copyFile(cachePath, temporary, require('fs').constants.COPYFILE_EXCL); await fs.rename(temporary, target); }
    finally { await fs.unlink(temporary).catch(() => {}); }
    return target;
  }

  async cacheAsset(asset, cachePath) {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const adapter = this.adapters.find(item => item.source === asset.source);
    // Resolve the real local path even for cache hits: a replaced symlink must not reuse an old approval.
    const local = asset.source === 'local' ? await adapter?.resolveDownload?.(asset) : null;
    if (asset.source === 'local' && !local?.file) throw new Error('Local stock asset could not be resolved safely');
    try {
      const stat = await fs.lstat(cachePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) throw new Error('Invalid cached stock media');
      if (local) {
        const original = await fs.stat(local.file);
        if (original.size !== stat.size || original.mtimeMs > stat.mtimeMs) throw new Error('Local stock source has changed');
      }
      Object.assign(asset, await this.probeMedia(cachePath, asset.type));
      await this.fichaBiblioteca(cachePath, asset);
      return cachePath;
    } catch (error) {
      if (error.code !== 'ENOENT') this.logger.warn?.('Cached stock media failed validation; retrieving it again');
    }
    const temporary = `${cachePath}.${crypto.randomUUID()}.part`;
    try {
      const resolved = local || (adapter?.resolveDownload ? await adapter.resolveDownload(asset) : { url: asset.url });
      if (asset.source === 'local') {
        if (!resolved.file) throw new Error('Local stock asset could not be resolved safely');
        await fs.copyFile(resolved.file, temporary, require('fs').constants.COPYFILE_EXCL);
      } else await media.downloadFile(resolved.url, asset.source, temporary, { fetchImpl: this.fetchImpl });
      const info = await this.probeMedia(temporary, asset.type);
      if (!(info?.width > 0 && info?.height > 0) || (asset.type === 'video' && !(info.durationSec > 0))) throw new Error('Stock asset failed media validation');
      Object.assign(asset, info);
      const hash = await this.hashMedia(temporary).catch(() => null);
      if (hash) asset.perceptualHash = hash;
      await fs.rename(temporary, cachePath);
      await this.fichaBiblioteca(cachePath, asset);
      return cachePath;
    } finally { await fs.unlink(temporary).catch(() => {}); }
  }
}

module.exports = { StockMediaService, scoreAsset, dedupeAssets, differenceHash: media.differenceHash, hammingDistance };
