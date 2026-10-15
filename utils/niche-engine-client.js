'use strict';
const { requestJSON } = require('./service-request');

class NicheEngineClient {
  constructor(baseURL = process.env.NICHE_ENGINE_URL, options = {}) {
    this.baseURL = String(baseURL || '').trim().replace(/\/+$/, '');
    this.fetch = options.fetchImpl || global.fetch;
    this.timeoutMs = options.timeoutMs || 15000;
  }

  isConfigured() {
    return Boolean(this.baseURL);
  }

  async request(path, options = {}) {
    if (!this.isConfigured()) {
      const error = new Error('Niche opportunity engine is not configured');
      error.status = 503;
      throw error;
    }
    return requestJSON(`${this.baseURL}${path}`, {
        ...options,
        fetchImpl: this.fetch, timeoutMs: this.timeoutMs, service: 'Motor de oportunidades',
        headers: {
          accept: 'application/json',
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(options.headers || {})
        }
    });
  }

  getStatus() {
    return this.request('/health');
  }

  listRuns() {
    return this.request('/runs');
  }

  getRun(runId) {
    if (!runId) throw new Error('A niche scan run ID is required');
    return this.request(`/runs/${encodeURIComponent(runId)}`);
  }

  startScan(input) {
    return this.request('/scan', { method: 'POST', body: JSON.stringify(input || {}) });
  }
}

module.exports = { NicheEngineClient };
