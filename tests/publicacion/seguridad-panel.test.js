const test = require('node:test');
const assert = require('node:assert/strict');
const { YouTubeAutomationAgent } = require('../../index');

async function server(t) {
  const previous = process.env.API_KEY;
  process.env.API_KEY = 'test-only';
  t.after(() => { if (previous === undefined) delete process.env.API_KEY; else process.env.API_KEY = previous; });
  const agent = new YouTubeAutomationAgent();
  const settings = { approval_required: 'true', video_provider: 'slideshow', daily_publish_time: '04:00', video_extras: '{}',
    instagram_token: 'PRIVATE-TEST-TOKEN', 'prefs:other@example.com': '{"tema":"claro"}', future_credential: 'SECRET-FUTURE' };
  const writes=[];
  agent.db = new Proxy({ getAllSettings: async () => settings, getSetting: async () => null,
    setSetting: async (...args) => { writes.push(args); }
  }, { get: (target, key) => target[key] || (async () => []) });
  agent.setupAPI();
  const http = await new Promise(resolve => { const listener = agent.app.listen(0,'127.0.0.1',()=>resolve(listener)); });
  t.after(() => new Promise(resolve=>{ http.closeAllConnections(); http.close(resolve); }));
  return { base:`http://127.0.0.1:${http.address().port}`, writes };
}

test('dashboard and saving settings exclude credentials and other people\'s preferences, future keys too', async t => {
  const {base}=await server(t);
  for (const [path,options] of [['/api/dashboard',{}],['/api/settings',{method:'PUT',headers:{'content-type':'application/json','x-api-key':'test-only'},body:'{}'}]]) {
    const response=await fetch(base+path,options);
    assert.equal(response.status,200);
    const data=await response.json();
    const settings=data.settings || data.result;
    assert.equal(settings.video_provider,'slideshow');
    assert.equal(settings.daily_publish_time,'04:00');
    assert.equal(settings.video_extras,'{}');
    assert.doesNotMatch(JSON.stringify(data),/PRIVATE-TEST-TOKEN|SECRET-FUTURE|other@example/);
    assert.match(response.headers.get('cache-control') || '',/no-store/);
  }
});

test('a third-party website can\'t save preferences or settings through the browser', async t => {
  const {base,writes}=await server(t);
  for (const headers of [{origin:'https://another.example'},{origin:'null'},{'sec-fetch-site':'cross-site'}]) {
    const response=await fetch(base+'/api/me/prefs',{method:'PUT',headers:{'content-type':'application/json',...headers},body:'{"tema":"claro"}'});
    assert.equal(response.status,403);
  }
  assert.equal(writes.length,0);
  const response=await fetch(base+'/api/me/prefs',{method:'PUT',headers:{'content-type':'application/json',origin:base},body:'{"tema":"claro"}'});
  assert.equal(response.status,200);
  assert.equal(writes.length,1);
});

test('the profile isn\'t stored in shared caches', async t => {
  const {base}=await server(t);
  const response=await fetch(base+'/api/me');
  assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control') || '',/no-store/);
});
