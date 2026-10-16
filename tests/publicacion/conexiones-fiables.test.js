const test = require('node:test');
const assert = require('node:assert/strict');
const { ResearchInboxClient } = require('../../utils/research-inbox-client');
const { NicheEngineClient } = require('../../utils/niche-engine-client');
const c = require('../../utils/conexiones');
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

for (const Client of [ResearchInboxClient, NicheEngineClient]) {
  test(`${Client.name}: rejects broken HTML/JSON instead of faking a good connection`, async () => {
    const client = new Client('http://service.local', { fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('HTML login'); } }) });
    await assert.rejects(client.request('/status'), error => error.status === 502);
  });
  test(`${Client.name}: doesn't forward provider messages or follow redirects`, async () => {
    const client = new Client('http://service.local', { fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, 'error');
      return response({ error: 'secret=private-token http://internal' }, 500);
    } });
    await assert.rejects(client.request('/status'), error => error.status === 502 && !/private-token|internal/.test(error.message));
  });
  test(`${Client.name}: the deadline also covers reading the body, without retrying writes`, async () => {
    let calls = 0;
    const client = new Client('http://service.local', { timeoutMs: 15, fetchImpl: async () => {
      calls++;
      return { ok: true, status: 200, json: () => new Promise(() => {}) };
    } });
    // The outer limit keeps the playback before the fix bounded.
    const result = await Promise.race([client.request('/write', { method: 'POST', body: '{}' }).catch(e => e), new Promise(resolve => setTimeout(() => resolve({ status: 'hung' }), 100))]);
    assert.equal(result.status, 504);
    assert.equal(calls, 1);
  });
}

test('Instagram: uses an authorization header and doesn\'t claim send permissions after reading the profile', async () => {
  const result = await c.instagram({ token: 'private-token', fetchImpl: async (url, options) => {
    assert.ok(!url.includes('private-token'));
    assert.equal(options.headers.Authorization, 'Bearer private-token');
    return response(url.includes('/me?') ? { username: 'example' } : { data: [] });
  } });
  assert.equal(result.estado, 'partial');
  assert.doesNotMatch(result.detalle, /Publica, comenta y envía/);
});

test('Instagram: an empty list doesn\'t prove the app is in development', async () => {
  const result = await c.instagram({ token: 't', fetchImpl: async url => response(url.includes('/me?')
    ? { username: 'example' } : url.includes('/me/media') ? { data: [{ id: '1', comments_count: 2 }] } : { data: [] }) });
  assert.equal(result.estado, 'partial');
  assert.doesNotMatch(result.detalle, /está en modo desarrollo/);
});

test('AI: a missing key plus an alternative provider isn\'t verification', async () => {
  assert.equal((await c.ia({ env: {} })).ok, false);
  const other = await c.ia({ env: { AI_TEXT_PROVIDER: 'openai', OPENROUTER_API_KEY: 'unused' }, fetchImpl: async () => { throw new Error('must not query inactive provider'); } });
  assert.equal(other.estado, 'unverified');
});

test('AI: a zero limit and unknown balance aren\'t shown as unlimited', async () => {
  const zero = await c.ia({ env: { OPENROUTER_API_KEY: 'key' }, fetchImpl: async () => response({ data: { limit: 0, limit_remaining: 0 } }) });
  assert.equal(zero.ok, false);
  const unknown = await c.ia({ env: { OPENROUTER_API_KEY: 'key' }, fetchImpl: async () => response({ data: { limit: 10, limit_remaining: null } }) });
  assert.equal(unknown.estado, 'partial');
  assert.doesNotMatch(unknown.detalle, /\$0\.00|Sin tope/);
});

test('network failures are isolated and don\'t expose keys or raw error messages', async () => {
  const result = await c.estadoConexiones({ env: { INSTAGRAM_TOKEN: 'private-token', OPENROUTER_API_KEY: 'private-key' }, fetchImpl: async () => { throw new Error('https://provider/?access_token=private-token private-key'); } });
  assert.equal(result.length, 3);
  assert.doesNotMatch(JSON.stringify(result), /private-token|private-key/);
});

test('monitor: shares concurrent requests and reuses only within the given window', async () => {
  let calls = 0; let now = 1000;
  const monitor = c.creaMonitor({ ttlMs: 100, now: () => now, check: async () => { calls++; return [{ ok: true, titulo: 'test' }]; } });
  const [a,b] = await Promise.all([monitor(),monitor()]);
  assert.deepEqual(a,b); assert.equal(calls,1);
  now=1099; await monitor(); assert.equal(calls,1);
  now=1101; await monitor(); assert.equal(calls,2);
});
