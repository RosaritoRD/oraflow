const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AccountsService } = require('../../utils/accounts-service');

function config({ creds = {}, tokens = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuentas-'));
  fs.writeFileSync(path.join(dir, 'credentials.json'), JSON.stringify(creds));
  fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify(tokens));
  return dir;
}

const credentials = (dir, creds = {}, tokens = {}) => ({
  credentials: creds,
  tokens,
  credentialsPath: path.join(dir, 'credentials.json'),
  tokensPath: path.join(dir, 'tokens.json'),
  async loadCredentials() { this.credentials = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8')); },
  async loadTokens() { this.tokens = JSON.parse(fs.readFileSync(this.tokensPath, 'utf8')); }
});

const SECRETO = 'fake-openrouter-key-for-tests-1234';

test('estado: dice qué está configurado y de dónde, sin enseñar ninguna clave', async () => {
  const creds = { youtube: { client_id: 'abc.apps.googleusercontent.com', client_secret: 'GOCSPX-secreto', redirect_uris: ['urn:ietf:wg:oauth:2.0:oob'] } };
  const tokens = { youtube: { refresh_token: '1//refresh-secreto', scope: 'https://www.googleapis.com/auth/youtube.upload' } };
  const dir = config({ creds, tokens });
  const s = new AccountsService({
    credentials: credentials(dir, creds, tokens),
    env: { OPENROUTER_API_KEY: SECRETO, PEXELS_API_KEY: '' }
  });
  const st = await s.status();
  const por = Object.fromEntries(st.accounts.map(a => [a.id, a]));
  assert.equal(por.youtube.configured, true);
  assert.equal(por.youtube.connected, true);
  assert.equal(por.openrouter.configured, true);
  assert.equal(por.openrouter.hint, '…1234');
  assert.equal(por.pexels.configured, false);
  assert.equal(por.dashboard_key.configured, false);
  const json = JSON.stringify(st);
  for (const secreto of [SECRETO, 'GOCSPX-secreto', '1//refresh-secreto']) assert.equal(json.includes(secreto), false, secreto);
  assert.ok(por.youtube.warnings.some(w => /oob/i.test(w)), 'avisa del redirect retirado por Google');
});

test('probar una clave: llamada real (simulada) y el mensaje nunca lleva la clave', async () => {
  const dir = config();
  const llamadas = [];
  const fetchFn = async (url, opts) => {
    llamadas.push({ url, opts });
    return { ok: false, status: 401, json: async () => ({ error: { message: `bad key ${SECRETO}` } }) };
  };
  const s = new AccountsService({ credentials: credentials(dir), env: { OPENROUTER_API_KEY: SECRETO }, fetchFn });
  const r = await s.test('openrouter');
  assert.equal(r.ok, false);
  assert.equal(r.message.includes(SECRETO), false);
  assert.match(r.message, /401|rechaz/i);
  assert.equal(llamadas[0].opts.headers.Authorization, `Bearer ${SECRETO}`);
});

test('probar Pexels ok', async () => {
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ total_results: 8000 }) });
  const s = new AccountsService({ credentials: credentials(config()), env: { PEXELS_API_KEY: 'k' }, fetchFn });
  const r = await s.test('pexels');
  assert.equal(r.ok, true);
});

test('probar algo sin configurar o desconocido', async () => {
  const s = new AccountsService({ credentials: credentials(config()), env: {} });
  assert.equal((await s.test('pexels')).ok, false);
  await assert.rejects(s.test('nada'), { status: 400 });
});

test('YouTube: invalid_client se explica en cristiano', async () => {
  const creds = { youtube: { client_id: 'x', client_secret: 'y', redirect_uris: ['https://a/cb'] } };
  const tokens = { youtube: { refresh_token: 'r' } };
  const youtubeFactory = () => ({ channels: { list: async () => { const e = new Error('invalid_client'); e.response = { data: { error: 'invalid_client' } }; throw e; } } });
  const s = new AccountsService({ credentials: credentials(config({ creds, tokens }), creds, tokens), env: {}, youtubeFactory });
  const r = await s.test('youtube');
  assert.equal(r.ok, false);
  assert.match(r.message, /client ID|cliente/i);
});

test('YouTube ok devuelve el canal conectado', async () => {
  const creds = { youtube: { client_id: 'x', client_secret: 'y', redirect_uris: ['https://a/cb'] } };
  const tokens = { youtube: { refresh_token: 'r' } };
  const youtubeFactory = () => ({ channels: { list: async () => ({ data: { items: [{ id: 'UC123', snippet: { title: 'Oración de Hoy' } }] } }) } });
  const s = new AccountsService({ credentials: credentials(config({ creds, tokens }), creds, tokens), env: {}, youtubeFactory });
  const r = await s.test('youtube');
  assert.equal(r.ok, true);
  assert.match(r.message, /Oración de Hoy/);
  assert.equal(r.channel.id, 'UC123');
});

test('guardar el cliente OAuth: valida, hace copia y no devuelve el secreto', async () => {
  const creds = { youtube: { client_id: 'viejo', client_secret: 'viejo-secreto', redirect_uris: ['urn:ietf:wg:oauth:2.0:oob'] }, channel: { channelName: 'X' } };
  const dir = config({ creds });
  const cred = credentials(dir, creds);
  const s = new AccountsService({ credentials: cred, env: {}, publicUrl: 'https://youtube.example.com' });
  await assert.rejects(s.saveYouTubeClient({ clientId: 'no-vale', clientSecret: 'x' }), { status: 400 });
  const r = await s.saveYouTubeClient({ clientId: '123-abc.apps.googleusercontent.com', clientSecret: 'GOCSPX-nuevo' });
  assert.equal(JSON.stringify(r).includes('GOCSPX-nuevo'), false);
  const guardado = JSON.parse(fs.readFileSync(path.join(dir, 'credentials.json'), 'utf8'));
  assert.equal(guardado.youtube.client_id, '123-abc.apps.googleusercontent.com');
  assert.equal(guardado.youtube.client_secret, 'GOCSPX-nuevo');
  assert.deepEqual(guardado.youtube.redirect_uris, ['https://youtube.example.com/api/accounts/youtube/callback']);
  assert.equal(guardado.channel.channelName, 'X', 'no toca el resto del archivo');
  assert.ok(fs.readdirSync(dir).some(f => f.startsWith('credentials.json.bak-')), 'deja copia del anterior');
  assert.equal(cred.credentials.youtube.client_id, '123-abc.apps.googleusercontent.com', 'recarga en caliente');
});

test('conectar YouTube: URL de Google con state, y el callback exige ese state', async () => {
  const creds = { youtube: { client_id: '1-a.apps.googleusercontent.com', client_secret: 's', redirect_uris: ['x'] } };
  const dir = config({ creds, tokens: { otro: 1 } });
  const cred = credentials(dir, creds, { otro: 1 });
  const intercambios = [];
  const oauthFactory = (id, secret, redirect) => ({
    generateAuthUrl: opts => `https://accounts.google.com/o/oauth2/v2/auth?state=${opts.state}&redirect_uri=${encodeURIComponent(redirect)}&prompt=${opts.prompt}`,
    getToken: async code => { intercambios.push({ code, redirect }); return { tokens: { refresh_token: 'nuevo', scope: 'a' } }; }
  });
  const s = new AccountsService({ credentials: cred, env: {}, publicUrl: 'https://yt.example.com', oauthFactory });
  const url = new URL(s.connectUrl());
  const state = url.searchParams.get('state');
  assert.ok(state && state.length >= 32);
  assert.equal(url.searchParams.get('prompt'), 'consent');
  await assert.rejects(s.finishConnect({ code: 'c', state: 'otro' }), { status: 400 });
  await s.finishConnect({ code: 'c', state });
  assert.deepEqual(intercambios, [{ code: 'c', redirect: 'https://yt.example.com/api/accounts/youtube/callback' }]);
  const tokens = JSON.parse(fs.readFileSync(path.join(dir, 'tokens.json'), 'utf8'));
  assert.equal(tokens.youtube.refresh_token, 'nuevo');
  assert.equal(tokens.otro, 1);
  await assert.rejects(s.finishConnect({ code: 'c', state }), { status: 400 }, 'el state es de un solo uso');
});

test('conectar sin cliente OAuth configurado es un error claro', () => {
  const s = new AccountsService({ credentials: credentials(config()), env: {} });
  assert.throws(() => s.connectUrl(), { status: 409 });
});

test('ElevenLabs con clave restringida: válida, pero avisa de que no deja ver el consumo', async () => {
  const fetchFn = async () => ({ ok: false, status: 401, json: async () => ({ detail: { status: 'missing_permissions', message: 'The API key you used is missing the permission user_read to execute this operation.' } }) });
  const s = new AccountsService({ credentials: credentials(config()), env: { ELEVENLABS_API_KEY: 'k'.repeat(20) }, fetchFn });
  const r = await s.test('elevenlabs');
  assert.equal(r.ok, true);
  assert.match(r.message, /limitad/i);
});

test('Gemini rechazada con una clave de formato raro: lo dice', async () => {
  const fetchFn = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Request had invalid authentication credentials.' } }) });
  const s = new AccountsService({ credentials: credentials(config()), env: { GEMINI_API_KEY: 'AQ.' + 'x'.repeat(100) }, fetchFn });
  const r = await s.test('gemini');
  assert.equal(r.ok, false);
  assert.match(r.message, /AIza/);
  assert.equal(r.message.includes('x'.repeat(20)), false);
});
