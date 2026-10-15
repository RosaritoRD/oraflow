/** Comprobaciones de lectura: no publican ni envían mensajes de prueba. */
const { requestJSON, ServiceRequestError } = require('./service-request');
const PERMISOS_FB = {
  pages_manage_posts: 'publicar', pages_read_engagement: 'leer la Página',
  pages_read_user_content: 'leer comentarios', pages_manage_engagement: 'responder comentarios'
};
const estado = (titulo, detalle, valor = 'verified') => ({ ok: valor === 'verified', estado: valor, titulo, detalle });
const consulta = (url, token, options, service) => requestJSON(url, {
  ...options, service, headers: { Authorization: `Bearer ${token}` }
});

async function instagram({ token, fetchImpl = fetch, timeoutMs = 4000, renovadoEl = null, now = new Date() }) {
  if (!token) return estado('Instagram', 'Sin conectar. Revisa la conexión de Instagram en Cuentas.', 'not_configured');
  const options = { fetchImpl, timeoutMs };
  const G = 'https://graph.instagram.com/v25.0';
  const me = await consulta(`${G}/me?fields=username`, token, options, 'Instagram');
  if (typeof me.username !== 'string' || !me.username) return estado('Instagram', 'No se pudo verificar la cuenta.', 'unavailable');
  const titulo = `Instagram @${me.username}`;
  const base = await lecturaInstagram({ G, token, options, titulo, yo: me.username });
  // Mensajes privados (07/10/2026): leer la bandeja usa el mismo permiso que la oración por privado.
  let privados;
  try {
    const r = await consulta(`${G}/me/conversations?platform=instagram&limit=1`, token, options, 'Instagram');
    privados = Array.isArray(r.data) ? { ok: true, texto: 'Mensajes privados: lectura verificada; el envío se confirma con el primer privado real.' }
      : { ok: false, texto: 'No se pudo comprobar la bandeja de mensajes privados.' };
  } catch (error) {
    privados = { ok: false, texto: `No se pueden leer los mensajes privados (${error.message}). Revisa el permiso de mensajes de la app de Meta y «Permitir acceso a los mensajes» en Instagram.` };
  }
  // El acceso dura 60 días y se renueva solo cada semana: si lleva más de 14 sin renovarse, algo falla (07/10/2026).
  const renovado = Date.parse(renovadoEl || '');
  const dias = Number.isFinite(renovado) ? Math.floor((now.getTime() - renovado) / 86400000) : null;
  const caduca = dias !== null && dias > 14
    ? ` ⚠ El acceso no se renueva desde hace ${dias} días y caduca el ${new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(renovado + 60 * 86400000))}: revisa el token en Cuentas.`
    : '';
  const final = caduca || (base.estado === 'verified' && !privados.ok) ? (base.estado === 'verified' ? 'partial' : base.estado) : base.estado;
  return estado(base.titulo, `${base.detalle} ${privados.texto}${caduca}`, final);
}

async function lecturaInstagram({ G, token, options, titulo, yo }) {
  const media = await consulta(`${G}/me/media?fields=id,comments_count&limit=10`, token, options, 'Instagram');
  if (!Array.isArray(media.data)) return estado(titulo, 'Cuenta accesible; no se pudo verificar la lista de publicaciones.', 'partial');
  const candidates = media.data.filter(m => m.comments_count > 0 && m.id).slice(0, 5);
  if (!candidates.length) return estado(titulo, 'Cuenta y publicaciones accesibles. No hay comentarios de muestra para verificar su lectura. Publicación sin comprobar.', 'partial');
  const replies = await Promise.allSettled(candidates.map(m => consulta(`${G}/${encodeURIComponent(m.id)}/comments?fields=id,username&limit=10`, token, options, 'Instagram')));
  const visibles = replies.flatMap(r => (r.status === 'fulfilled' && Array.isArray(r.value.data) ? r.value.data : []));
  if (!visibles.length) return estado(titulo, 'Hay comentarios contados, pero la consulta no permite leerlos. Revisa permisos y el modo desarrollo de Meta; una lista vacía no confirma la causa.', 'partial');
  // Los del propio canal (comentario fijo, respuestas) no cuentan como gente.
  const otros = visibles.filter(c => c.username && c.username !== yo).length;
  const gente = otros
    ? `${otros} comentario${otros === 1 ? '' : 's'} de otras personas en las últimas publicaciones.`
    : 'Todavía ningún comentario de otras personas en las últimas publicaciones (si la gente sí comenta, la app de Meta sigue en modo desarrollo).';
  if (replies.some(r => r.status === 'rejected' || !Array.isArray(r.value.data))) return estado(titulo, `Cuenta accesible; lectura de comentarios parcialmente verificada. Algunas consultas fallaron. ${gente}`, 'partial');
  return estado(titulo, `Lectura de cuenta, publicaciones y comentarios verificada. ${gente} Publicación sin comprobar.`);
}

async function facebook({ config, fetchImpl = fetch, timeoutMs = 4000 }) {
  if (!config) return estado('Facebook', 'Sin conectar. Revisa la Página y su acceso en Cuentas.', 'not_configured');
  const options = { fetchImpl, timeoutMs };
  // debug_token requiere input_token; la autenticación va en la cabecera.
  const base = `https://graph.facebook.com/${encodeURIComponent(config.version)}`;
  const r = await consulta(`${base}/debug_token?input_token=${encodeURIComponent(config.token)}`, config.token, options, 'Facebook');
  if (!r.data?.is_valid) return estado('Facebook', 'El acceso no es válido. Vuelve a conectar la Página.', 'unavailable');
  if (!Array.isArray(r.data.scopes)) return estado('Facebook', 'Acceso válido; el proveedor no devolvió los permisos.', 'partial');
  const missing = Object.entries(PERMISOS_FB).filter(([permission]) => !r.data.scopes.includes(permission)).map(([, label]) => label);
  if (missing.length) return estado('Facebook (Página)', `Faltan permisos para: ${missing.join(', ')}. Revisa la autorización de la Página.`, 'partial');
  if (!config.pageId) return estado('Facebook', 'Permisos concedidos; falta identificar la Página.', 'partial');
  const page = await consulta(`${base}/${encodeURIComponent(config.pageId)}?fields=id`, config.token, options, 'Facebook');
  if (String(page.id || '') !== String(config.pageId)) return estado('Facebook', 'No se pudo verificar el acceso a la Página configurada.', 'unavailable');
  return estado('Facebook (Página)', 'Acceso a la Página y permisos verificados. No se ha probado una publicación ni una respuesta.');
}

async function ia({ env = process.env, fetchImpl = fetch, timeoutMs = 4000 }) {
  const provider = String(env.AI_TEXT_PROVIDER || '').trim().toLowerCase();
  if (provider && !['auto', 'automatic', 'openrouter'].includes(provider)) return estado('IA (texto)', `Proveedor seleccionado: ${provider}. Su conexión todavía no se ha verificado.`, 'unverified');
  if (!env.OPENROUTER_API_KEY) return estado('IA (texto)', 'Conexión de texto sin verificar. Comprueba el proveedor en Cuentas.', 'unverified');
  const { data } = await consulta('https://openrouter.ai/api/v1/key', env.OPENROUTER_API_KEY, { fetchImpl, timeoutMs }, 'OpenRouter');
  if (!data || typeof data !== 'object') return estado('IA (OpenRouter)', 'No se pudo verificar la clave.', 'unavailable');
  if (data.limit === null) return estado('IA (OpenRouter)', 'Clave verificada, sin tope individual. El saldo de la cuenta no se ha comprobado.');
  if (!Number.isFinite(data.limit) || !Number.isFinite(data.limit_remaining)) return estado('IA (OpenRouter)', 'Clave accesible; el proveedor no devolvió un límite y un saldo válidos.', 'partial');
  return data.limit_remaining < 0.5
    ? estado('IA (OpenRouter)', `Quedan $${data.limit_remaining.toFixed(2)} del tope de la clave. Revisa el límite en OpenRouter.`, 'partial')
    : estado('IA (OpenRouter)', `Clave verificada. Quedan $${data.limit_remaining.toFixed(2)} del tope individual; saldo de cuenta sin comprobar.`);
}

// El PC del autor (07/10/2026): taller de ffmpeg, voz local e IA local. Si no
// responde, la VPS hace el trabajo: se avisa, pero no es una caída del canal.
async function pc({ env = process.env, fetchImpl = fetch, timeoutMs = 4000, taller = null }) {
  const urlTaller = String(env.FFMPEG_REMOTO_URL || '').replace(/\/+$/, '');
  if (!urlTaller) return estado('PC (taller)', 'Sin configurar: todos los vídeos se hacen en la VPS.', 'not_configured');
  const prueba = async (url) => {
    if (!url) return null;
    try {
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      return r.ok ? await r.json() : null;
    } catch (_e) { return null; }
  };
  const [t, voz, llm] = await Promise.all([
    prueba(`${urlTaller}/api/salud`),
    prueba(env.LOCAL_VOZ_URL ? `${String(env.LOCAL_VOZ_URL).replace(/\/+$/, '')}/api/salud` : null),
    prueba(env.LOCAL_LLM_URL ? `${String(env.LOCAL_LLM_URL).replace(/\/+$/, '')}/api/tags` : null)
  ]);
  const cuenta = taller ? ` Desde el último arranque: ${taller.remotos || 0} en el PC, ${taller.locales || 0} en la VPS${taller.fallos ? `, ${taller.fallos} fallos` : ''}.` : '';
  if (!t) return estado('PC (taller)', `El PC no responde: los vídeos se hacen en la VPS (más lento).${cuenta}`, 'partial');
  const extras = [voz ? 'voz local lista' : (env.LOCAL_VOZ_URL ? 'voz local sin respuesta' : null), llm ? 'IA local lista' : (env.LOCAL_LLM_URL ? 'IA local sin respuesta' : null)].filter(Boolean);
  return estado('PC (taller)', `Haciendo los vídeos con ${t.nucleos || '?'} núcleos${extras.length ? `; ${extras.join(', ')}` : ''}.${cuenta}`, (env.LOCAL_VOZ_URL && !voz) || (env.LOCAL_LLM_URL && !llm) ? 'partial' : 'verified');
}

// YouTube (07/10/2026): una consulta de 1 unidad; con la cuota agotada no se gasta nada.
async function youtube({ youtube: cliente, db }) {
  if (!cliente) return estado('YouTube', 'Sin conectar. Autoriza el canal en Cuentas.', 'not_configured');
  const cuota = require('./cuota-youtube');
  if (db && await cuota.agotada(db)) {
    const hasta = await db.getSetting('youtube_cuota_hasta');
    const hora = new Intl.DateTimeFormat('es', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(hasta));
    return estado('YouTube', `Cuota diaria de la API agotada hasta ${hora} (Nueva York). Las respuestas y comentarios esperan; la subida del vídeo puede fallar hasta entonces.`, 'partial');
  }
  try {
    const r = await cliente.channels.list({ part: ['snippet'], mine: true });
    const canal = r?.data?.items?.[0]?.snippet?.title;
    if (!canal) return estado('YouTube', 'La cuenta autorizada no tiene un canal visible.', 'unavailable');
    return estado(`YouTube «${canal}»`, 'Canal accesible y cuota disponible. La subida se comprueba con el vídeo del día.');
  } catch (error) {
    const msg = String(error?.message || '');
    if (/invalid_grant|unauthorized|invalid credentials|401/i.test(msg)) return estado('YouTube', 'La autorización caducó o se revocó: hay que volver a autorizar el canal en Cuentas.', 'unavailable');
    if (require('./cuota-youtube').esCuota(error)) return estado('YouTube', 'Cuota diaria de la API agotada. La subida del vídeo puede fallar hasta que se renueve.', 'partial');
    return estado('YouTube', 'No se pudo comprobar el canal. Vuelve a intentarlo.', 'unavailable');
  }
}

async function estadoConexiones({ db, env = process.env, fetchImpl = fetch, researchInbox, nicheEngine, youtube: clienteYouTube, timeoutMs = 4000 }) {
  const { tokenInstagram } = require('./instagram-reels');
  const { facebookConfig } = require('./facebook-reels');
  const safe = async (fn, title) => {
    try { return await fn(); } catch (error) {
      const detail = error instanceof ServiceRequestError ? error.message : 'No se pudo comprobar la conexión. Vuelve a intentarlo.';
      return estado(title, detail, 'unavailable');
    }
  };
  const checks = [
    ...(clienteYouTube !== undefined ? [safe(() => youtube({ youtube: clienteYouTube, db }), 'YouTube')] : []),
    safe(async () => instagram({ token: await tokenInstagram(db, env), fetchImpl, timeoutMs, renovadoEl: await db?.getSetting?.('instagram_token_refreshed_at') }), 'Instagram'),
    safe(() => facebook({ config: facebookConfig(env), fetchImpl, timeoutMs }), 'Facebook'),
    safe(() => ia({ env, fetchImpl, timeoutMs }), 'IA'),
    ...(env.FFMPEG_REMOTO_URL ? [safe(() => pc({ env, fetchImpl, timeoutMs, taller: require('./ffmpeg')._taller.estado() }), 'PC (taller)')] : [])
  ];
  if (researchInbox) checks.push(safe(async () => {
    if (!researchInbox.isConfigured()) return estado('Bandeja de investigación', 'No está conectada.', 'not_configured');
    const result = await researchInbox.getState();
    return Array.isArray(result.nichos) && Array.isArray(result.notas)
      ? estado('Bandeja de investigación', 'Conexión verificada. Las notas y los nichos se pueden consultar.')
      : estado('Bandeja de investigación', 'El servicio respondió, pero no devolvió datos válidos.', 'unavailable');
  }, 'Bandeja de investigación'));
  if (nicheEngine) checks.push(safe(async () => {
    if (!nicheEngine.isConfigured()) return estado('Motor de oportunidades', 'No está conectado.', 'not_configured');
    const result = await nicheEngine.getStatus();
    if (result.ok !== true) return estado('Motor de oportunidades', 'El servicio no confirmó su disponibilidad.', 'unavailable');
    return result.auth?.configured
      ? estado('Motor de oportunidades', 'Servicio accesible y acceso a YouTube configurado. La búsqueda no se ha ejecutado.', result.auth.verified ? 'verified' : 'partial')
      : estado('Motor de oportunidades', 'Servicio accesible; falta configurar su acceso a YouTube.', 'partial');
  }, 'Motor de oportunidades'));
  return Promise.all(checks);
}

function creaMonitor({ check = () => estadoConexiones({}), ttlMs = 60000, now = Date.now } = {}) {
  let cached = null; let expires = 0; let pending = null;
  return async () => {
    if (cached && now() < expires) return cached;
    if (!pending) pending = Promise.resolve().then(check).then(result => {
      cached = result.map(item => ({ ...item, checkedAt: new Date(now()).toISOString() }));
      expires = now() + ttlMs;
      return cached;
    }).finally(() => { pending = null; });
    return pending;
  };
}

module.exports = { PERMISOS_FB, instagram, facebook, ia, youtube, pc, estadoConexiones, creaMonitor };
