// Cuentas y claves: qué está configurado (sin enseñar nunca una clave), probar
// cada conexión de verdad y reconectar el canal de YouTube desde la web.
const fs = require('fs').promises;
const crypto = require('crypto');

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl'
];
const CALLBACK_PATH = '/api/accounts/youtube/callback';
const STATE_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 10000;

function fallo(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const cola = value => (value ? `…${String(value).slice(-4)}` : null);

class AccountsService {
  constructor({ credentials, env = process.env, fetchFn = globalThis.fetch, youtubeFactory, oauthFactory, publicUrl, logger } = {}) {
    this.credentials = credentials;
    this.env = env;
    this.fetch = fetchFn;
    this.youtubeFactory = youtubeFactory || (() => this.credentials.getYouTubeClient());
    this.oauthFactory = oauthFactory || ((id, secret, redirect) => {
      const { google } = require('googleapis');
      return new google.auth.OAuth2(id, secret, redirect);
    });
    this.publicUrl = String(publicUrl || env.PUBLIC_URL || 'https://panel.tu-dominio.com').replace(/\/+$/, '');
    this.logger = logger;
    this.states = new Map();
  }

  get redirectUri() {
    return `${this.publicUrl}${CALLBACK_PATH}`;
  }

  /* Cada clave: [valor, origen]. El archivo de credenciales manda sobre el entorno,
     igual que en el resto de Oraflow. */
  claves() {
    const c = this.credentials.credentials || {};
    const e = this.env;
    const de = (archivo, entorno) => (archivo ? [archivo, 'file'] : entorno ? [entorno, 'env'] : [null, null]);
    return {
      youtube_api: de(null, e.YOUTUBE_API_KEY),
      openrouter: de(c.aiProvider?.provider === 'openrouter' ? c.aiProvider.apiKey : null, e.OPENROUTER_API_KEY),
      gemini: de(c.gemini?.apiKey, e.GEMINI_API_KEY),
      openai: de(c.openai?.apiKey, e.OPENAI_API_KEY),
      elevenlabs: de(c.elevenLabs?.apiKey, e.ELEVENLABS_API_KEY),
      pexels: de(null, e.PEXELS_API_KEY),
      dashboard_key: de(null, e.API_KEY)
    };
  }

  youtubeStatus() {
    const yt = this.credentials.credentials?.youtube || {};
    const tok = this.credentials.tokens?.youtube || {};
    const scopes = String(tok.scope || '').split(/\s+/).filter(Boolean);
    const warnings = [];
    const redirect = yt.redirect_uris?.[0] || '';
    if (/oob/.test(redirect)) warnings.push('redirect_oob');
    if (tok.refresh_token && !scopes.includes(SCOPES[0])) warnings.push('missing_upload_scope');
    return {
      id: 'youtube',
      configured: Boolean(yt.client_id && yt.client_secret),
      connected: Boolean(tok.refresh_token),
      source: yt.client_id ? 'file' : null,
      hint: yt.client_id ? `${String(yt.client_id).slice(0, 14)}…` : null,
      scopes: scopes.map(s => s.replace('https://www.googleapis.com/auth/', '')),
      redirectUri: this.redirectUri,
      warnings
    };
  }

  async status() {
    const accounts = [this.youtubeStatus()];
    for (const [id, [valor, source]] of Object.entries(this.claves())) {
      accounts.push({ id, configured: Boolean(valor), source, hint: cola(valor), warnings: [] });
    }
    return { accounts, publicUrl: this.publicUrl };
  }

  limpiar(texto) {
    let out = String(texto ?? '');
    for (const [valor] of Object.values(this.claves())) {
      if (valor && valor.length >= 6) out = out.split(valor).join('***');
    }
    const yt = this.credentials.credentials?.youtube;
    if (yt?.client_secret) out = out.split(yt.client_secret).join('***');
    return out.slice(0, 240);
  }

  async http(url, headers) {
    const res = await this.fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    let body = {};
    try { body = await res.json(); } catch (_) { /* cuerpo vacío o no JSON */ }
    return { res, body };
  }

  async test(id) {
    if (id === 'youtube') return this.testYouTube();
    const pruebas = {
      openrouter: k => ['https://openrouter.ai/api/v1/auth/key', { Authorization: `Bearer ${k}` }],
      gemini: k => ['https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { 'x-goog-api-key': k }],
      openai: k => ['https://api.openai.com/v1/models', { Authorization: `Bearer ${k}` }],
      elevenlabs: k => ['https://api.elevenlabs.io/v1/user/subscription', { 'xi-api-key': k }],
      pexels: k => ['https://api.pexels.com/v1/search?query=sky&per_page=1', { Authorization: k }],
      youtube_api: k => ['https://www.googleapis.com/youtube/v3/i18nRegions?part=snippet&hl=es', { 'x-goog-api-key': k }]
    };
    if (!pruebas[id]) throw fallo(400, 'Cuenta desconocida');
    const [clave] = this.claves()[id];
    if (!clave) return { ok: false, message: 'No está configurada.' };
    try {
      const [url, headers] = pruebas[id](clave);
      const { res, body } = await this.http(url, headers);
      // Una clave restringida (ElevenLabs) responde 401 "missing the permission" a
      // lo que no tiene permitido: la clave existe y es válida para lo suyo.
      const restringida = JSON.stringify(body || {}).match(/missing[_ ]the[_ ]permission|missing_permissions/i);
      if (!res.ok && res.status === 401 && restringida) {
        return { ok: true, message: 'Clave válida, con permisos limitados (no deja ver el consumo desde aquí).' };
      }
      if (!res.ok) {
        const detalle = body?.error?.message || body?.error || body?.detail?.message || body?.message || '';
        const motivo = [401, 403].includes(res.status) ? 'El servicio rechazó la clave' : 'El servicio respondió con error';
        // Las claves de Google AI Studio / Cloud empiezan por "AIza": si no, casi seguro
        // se pegó otro tipo de credencial.
        if (['gemini', 'youtube_api'].includes(id) && !clave.startsWith('AIza')) {
          return { ok: false, message: `${motivo} (HTTP ${res.status}). Las claves de API de Google suelen empezar por «AIza» y esta empieza distinto: revisa que sea una clave de API (aistudio.google.com para Gemini, Google Cloud para YouTube) y no otro tipo de credencial.` };
        }
        return { ok: false, message: this.limpiar(`${motivo} (HTTP ${res.status})${detalle ? `: ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}` : ''}`) };
      }
      return { ok: true, message: this.resumen(id, body) };
    } catch (error) {
      const tiempo = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      return { ok: false, message: tiempo ? 'El servicio no respondió a tiempo.' : this.limpiar(`No se pudo conectar: ${error.message}`) };
    }
  }

  resumen(id, body) {
    if (id === 'elevenlabs' && body?.character_limit) {
      return `Clave válida · ${body.character_count ?? 0} de ${body.character_limit} caracteres usados este mes.`;
    }
    if (id === 'openrouter' && body?.data) {
      const usado = Number(body.data.usage ?? 0).toFixed(2);
      const limite = body.data.limit == null ? 'sin límite' : `límite $${body.data.limit}`;
      return `Clave válida · $${usado} usados · ${limite}.`;
    }
    return 'Clave válida.';
  }

  async testYouTube() {
    const st = this.youtubeStatus();
    if (!st.configured) return { ok: false, message: 'Falta el cliente OAuth de Google (client ID y secret).' };
    if (!st.connected) return { ok: false, message: 'El cliente está, pero ningún canal ha dado permiso todavía: pulsa «Conectar canal».' };
    try {
      const { data } = await this.youtubeFactory().channels.list({ part: 'snippet', mine: true });
      const canal = data?.items?.[0];
      if (!canal) return { ok: false, message: 'Esa cuenta de Google no tiene canal de YouTube.' };
      return { ok: true, message: `Conectado al canal «${canal.snippet?.title}».`, channel: { id: canal.id, title: canal.snippet?.title } };
    } catch (error) {
      const codigo = error?.response?.data?.error || error.message || '';
      if (/invalid_client/.test(codigo)) {
        return { ok: false, message: 'Google no reconoce el cliente OAuth (client ID o secret incorrectos, o el cliente se borró). Pega uno válido abajo y vuelve a conectar.' };
      }
      if (/invalid_grant/.test(codigo)) {
        return { ok: false, message: 'El permiso del canal caducó o se revocó. Pulsa «Conectar canal» para darlo de nuevo.' };
      }
      return { ok: false, message: this.limpiar(`YouTube respondió con error: ${error.message}`) };
    }
  }

  async escribirJson(ruta, datos) {
    const sello = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.copyFile(ruta, `${ruta}.bak-${sello}`).catch(() => {});
    const tmp = `${ruta}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(datos, null, 2), { mode: 0o600 });
    await fs.rename(tmp, ruta);
  }

  async saveYouTubeClient({ clientId, clientSecret } = {}) {
    const id = String(clientId || '').trim();
    const secret = String(clientSecret || '').trim();
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) throw fallo(400, 'El client ID debe terminar en .apps.googleusercontent.com');
    if (!/^\S{10,200}$/.test(secret)) throw fallo(400, 'El client secret no parece válido');
    const ruta = this.credentials.credentialsPath;
    const actual = JSON.parse(await fs.readFile(ruta, 'utf8').catch(() => '{}'));
    actual.youtube = { ...(actual.youtube || {}), client_id: id, client_secret: secret, redirect_uris: [this.redirectUri] };
    await this.escribirJson(ruta, actual);
    await this.credentials.loadCredentials();
    this.logger?.info?.('Cliente OAuth de YouTube actualizado desde el panel');
    // Un refresh token pertenece al cliente que lo emitió: con otro cliente hay que reconectar.
    return { ...this.youtubeStatus(), needsReconnect: true };
  }

  connectUrl() {
    const yt = this.credentials.credentials?.youtube;
    if (!yt?.client_id || !yt?.client_secret) throw fallo(409, 'Primero guarda el cliente OAuth de Google');
    const ahora = Date.now();
    for (const [s, exp] of this.states) if (exp < ahora) this.states.delete(s);
    const state = crypto.randomBytes(32).toString('hex');
    this.states.set(state, ahora + STATE_TTL_MS);
    const cliente = this.oauthFactory(yt.client_id, yt.client_secret, this.redirectUri);
    return cliente.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES, state, include_granted_scopes: true });
  }

  async finishConnect({ code, state, error } = {}) {
    if (error) throw fallo(400, `Google no dio el permiso (${String(error).slice(0, 60)})`);
    const exp = this.states.get(String(state || ''));
    this.states.delete(String(state || ''));
    if (!exp || exp < Date.now()) throw fallo(400, 'El enlace de conexión caducó o no es válido. Vuelve a pulsar «Conectar canal».');
    if (!code) throw fallo(400, 'Google no devolvió el código de autorización');
    const yt = this.credentials.credentials.youtube;
    const cliente = this.oauthFactory(yt.client_id, yt.client_secret, this.redirectUri);
    const { tokens } = await cliente.getToken(String(code));
    if (!tokens?.refresh_token) throw fallo(400, 'Google no entregó un permiso permanente. Quita el acceso de la app en tu cuenta de Google y vuelve a conectar.');
    const ruta = this.credentials.tokensPath;
    const actual = JSON.parse(await fs.readFile(ruta, 'utf8').catch(() => '{}'));
    actual.youtube = tokens;
    await this.escribirJson(ruta, actual);
    await this.credentials.loadTokens();
    this.logger?.info?.('Canal de YouTube reconectado desde el panel');
    return { connected: true };
  }
}

module.exports = { AccountsService, SCOPES, CALLBACK_PATH };
