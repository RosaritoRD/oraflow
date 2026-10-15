const { URLSearchParams } = require('node:url');
const { requestJSON } = require('./service-request');

class ResearchInboxClient {
  constructor(baseURL = process.env.YT_INBOX_URL, options = {}) {
    this.baseURL = String(baseURL || '').trim().replace(/\/+$/, '');
    this.fetch = options.fetchImpl || fetch;
    this.timeoutMs = options.timeoutMs || 5000;
  }

  isConfigured() {
    return Boolean(this.baseURL);
  }

  async request(pathname, options = {}) {
    if (!this.isConfigured()) {
      const error = new Error('Research Inbox is not connected');
      error.status = 503;
      throw error;
    }

    return requestJSON(`${this.baseURL}${pathname}`, {
        ...options,
        fetchImpl: this.fetch, timeoutMs: this.timeoutMs, service: 'Bandeja de investigación',
        headers: {
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(options.headers || {})
        }
    });
  }

  getState() {
    return this.request('/api/estado');
  }

  getTemplates() {
    return this.request('/api/plantillas');
  }

  getIdeas({ topic = '', title = '' } = {}) {
    const params = new URLSearchParams();
    if (topic) params.set('tema', topic);
    if (title) params.set('titulo', title);
    return this.request(`/api/ideas?${params.toString()}`);
  }

  getNiche(slug) {
    const params = new URLSearchParams({ slug: String(slug || '') });
    return this.request(`/api/nicho?${params.toString()}`);
  }

  saveNote(note) {
    return this.request('/api/nota', { method: 'POST', body: JSON.stringify(note || {}) });
  }

  saveNiche(niche) {
    return this.request('/api/nicho', { method: 'POST', body: JSON.stringify(niche || {}) });
  }
}

module.exports = { ResearchInboxClient };
