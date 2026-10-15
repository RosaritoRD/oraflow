const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { IMAGE_EXT, VIDEO_EXT, tokens, orientationMatches, probeMedia: defaultProbe } = require('./media');

function buildLocalAsset(file, metadata = {}) {
  const title = path.basename(file, path.extname(file)).replace(/[-_]+/g, ' ');
  return { id: `local_${crypto.createHash('md5').update(file).digest('hex').slice(0, 12)}`, source: 'local',
    type: VIDEO_EXT.has(path.extname(file).toLowerCase()) ? 'video' : 'image', title, url: file, previewUrl: file,
    width: metadata.width || null, height: metadata.height || null, durationSec: metadata.durationSec || null,
    license: 'own', keywords: [...tokens(title)], downloadable: true, raw: { file } };
}

class LocalAdapter {
  constructor({ directory = process.env.BACKGROUNDS_DIR, probeMedia = defaultProbe } = {}) {
    this.source = 'local'; this.directory = directory ? path.resolve(directory) : null; this.probeMedia = probeMedia; this.metadata = new Map();
  }
  async files() {
    if (!this.directory) return [];
    try {
      const entries = await fs.readdir(this.directory, { withFileTypes: true });
      return entries.filter(entry => entry.isFile() && (IMAGE_EXT.has(path.extname(entry.name).toLowerCase()) || VIDEO_EXT.has(path.extname(entry.name).toLowerCase())))
        .map(entry => path.join(this.directory, entry.name)).sort();
    } catch { return []; }
  }
  async isAvailable() { return (await this.files()).length > 0; }
  async resolveDownload(asset) {
    if (!this.directory) throw new Error('Local stock directory is not configured');
    const root = await fs.realpath(this.directory);
    const file = await fs.realpath(asset.url);
    if (!file.startsWith(`${root}${path.sep}`) || !(await fs.stat(file)).isFile()) throw new Error('Local asset is outside BACKGROUNDS_DIR');
    if (!IMAGE_EXT.has(path.extname(file).toLowerCase()) && !VIDEO_EXT.has(path.extname(file).toLowerCase())) throw new Error('Unsupported local stock media');
    return { file };
  }
  async search({ queries = [], preferredAssetType = 'image', orientation = 'landscape', minDurationSec = 5, limit = 8 } = {}) {
    const wanted = tokens(queries.join(' '));
    const files = (await this.files()).map(file => buildLocalAsset(file));
    const rank = asset => [...tokens(asset.title)].filter(token => wanted.has(token)).length * 10 + (asset.type === preferredAssetType ? 1 : 0);
    files.sort((a, b) => rank(b) - rank(a));
    const results = [];
    for (const asset of files) {
      if (results.length >= limit * 2) break;
      try {
        const { file } = await this.resolveDownload(asset);
        const stat = await fs.stat(file);
        const key = `${file}:${stat.size}:${stat.mtimeMs}`;
        let metadata = this.metadata.get(key);
        if (!metadata) { metadata = await this.probeMedia(file, asset.type); this.metadata.set(key, metadata); }
        if (this.metadata.size > 1000) this.metadata.delete(this.metadata.keys().next().value);
        Object.assign(asset, metadata);
        asset.raw = { file, size: stat.size, mtimeMs: stat.mtimeMs };
        if (!orientationMatches(asset.width, asset.height, orientation) || (asset.type === 'video' && !(asset.durationSec >= minDurationSec))) continue;
        results.push(asset);
      } catch { /* One damaged file must not disable other candidates. */ }
    }
    return results;
  }
}

module.exports = { LocalAdapter, buildLocalAsset };
