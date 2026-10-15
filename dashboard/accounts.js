/* global i18n */
/* global ui, api, escapeHTML, showToast */
// Pestaña Cuentas: estado de cada conexión, probarla y reconectar YouTube.
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const cuentas = ui.accounts = { state: null, results: {} };

  // Nombre y para qué sirve cada clave (el servidor solo da ids y estado).
  const INFO = {
    youtube_api: ['YouTube Data API', 'Research radar: reads public YouTube data. It does not publish.'],
    openrouter: ['OpenRouter', 'Writes scripts, titles and descriptions (AI text).'],
    gemini: ['Gemini', 'Images and AI video clips; also AI text if selected.'],
    openai: ['OpenAI', 'Images and voice if configured.'],
    elevenlabs: ['ElevenLabs', 'Narration voice of the videos.'],
    pexels: ['Pexels', 'Free stock photos and videos for scenes.'],
    dashboard_key: ['Dashboard API key', 'Protects the buttons that change things. Without it, anyone who passes the Google login can use them.']
  };
  const WARNINGS = {
    redirect_oob: 'The saved return address (“oob”) is no longer accepted by Google. The channel keeps working, but if you ever need to reconnect, first replace the OAuth client below.',
    missing_upload_scope: 'The channel permission does not include uploading videos: connect again.'
  };

  async function load() {
    try {
      cuentas.state = (await api('/api/accounts')).result;
      render();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function chip(cuenta) {
    if (!cuenta.configured) return i18n.html`<span class="status failed">Missing</span>`;
    if (cuenta.id === 'youtube' && !cuenta.connected) return i18n.html`<span class="status needs_review">Not connected</span>`;
    const r = cuentas.results[cuenta.id];
    if (r) return r.ok ? i18n.html`<span class="status approved">Works</span>` : i18n.html`<span class="status failed">Error</span>`;
    return i18n.html`<span class="status">Configured</span>`;
  }

  function origen(cuenta) {
    if (cuenta.source === 'env') return i18n.t('from .env');
    if (cuenta.source === 'file') return i18n.t('from credentials file');
    return i18n.t('not configured');
  }

  function render() {
    const st = cuentas.state;
    if (!st) return;
    const yt = st.accounts.find(a => a.id === 'youtube');
    $('#yt-status').outerHTML = chip(yt).replace('<span class="', '<span id="yt-status" class="');
    $('#yt-redirect').textContent = yt.redirectUri;
    const warnings = yt.warnings.map(w => i18n.html`<p class="account-warning">${escapeHTML(i18n.t(WARNINGS[w] || w))}</p>`).join('');
    $('#yt-detail').innerHTML = i18n.html`
      <dl class="account-facts">
        <div><dt>OAuth client</dt><dd>${escapeHTML(yt.hint || i18n.t('not configured'))}</dd></div>
        <div><dt>Channel permission</dt><dd>${yt.connected ? escapeHTML(i18n.t('granted')) : escapeHTML(i18n.t('not granted'))}</dd></div>
        <div><dt>Permissions</dt><dd>${escapeHTML(yt.scopes.join(', ') || '—')}</dd></div>
      </dl>${warnings}`;
    $('#yt-connect').classList.toggle('disabled', !yt.configured);
    $('#yt-connect').setAttribute('aria-disabled', String(!yt.configured));
    resultado('youtube');

    $('#accounts-grid').innerHTML = st.accounts.filter(a => a.id !== 'youtube').map(a => {
      const [nombre, para] = INFO[a.id] || [a.id, ''];
      const probable = a.id !== 'dashboard_key' && a.configured;
      return i18n.html`
      <article class="panel account-card">
        <div class="account-card-head"><h3>${escapeHTML(i18n.t(nombre))}</h3>${chip(a)}</div>
        <p class="account-purpose">${escapeHTML(i18n.t(para))}</p>
        <p class="account-meta">${escapeHTML(origen(a))}${a.hint ? ` · ${escapeHTML(a.hint)}` : ''}</p>
        ${probable ? i18n.html`<button type="button" class="button secondary small" data-account-test="${escapeHTML(a.id)}">Test</button>` : ''}
        <p class="account-result" data-account-result="${escapeHTML(a.id)}" role="status"></p>
      </article>`;
    }).join('');
    for (const id of Object.keys(cuentas.results)) resultado(id);
  }

  function resultado(id) {
    const el = document.querySelector(`[data-account-result="${CSS.escape(id)}"]`);
    const r = cuentas.results[id];
    if (!el) return;
    el.textContent = r ? r.message : '';
    el.className = `account-result ${r ? (r.ok ? 'ok' : 'bad') : ''}`;
  }

  async function probar(id) {
    const boton = document.querySelector(`[data-account-test="${CSS.escape(id)}"]`);
    if (boton) boton.disabled = true;
    const el = document.querySelector(`[data-account-result="${CSS.escape(id)}"]`);
    if (el) { el.textContent = i18n.t('Testing…'); el.className = 'account-result'; }
    try {
      cuentas.results[id] = (await api(`/api/accounts/${encodeURIComponent(id)}/test`, { method: 'POST' })).result;
    } catch (error) {
      cuentas.results[id] = { ok: false, message: error.message };
    } finally {
      if (boton) boton.disabled = false;
    }
    render();
  }

  document.addEventListener('click', event => {
    const test = event.target.closest('[data-account-test]');
    if (test) probar(test.dataset.accountTest);
    if (event.target.closest('#yt-connect.disabled')) {
      event.preventDefault();
      showToast(i18n.t('First save a Google OAuth client.'), 'error');
    }
  });

  $('#accounts-test-all').addEventListener('click', async () => {
    const ids = (cuentas.state?.accounts || []).filter(a => a.configured && a.id !== 'dashboard_key').map(a => a.id);
    for (const id of ids) await probar(id);
  });
  $('#yt-client-toggle').addEventListener('click', () => {
    $('#yt-client-form').classList.toggle('hidden');
    $('#yt-client-form input[name="clientId"]').focus();
  });
  $('#yt-client-cancel').addEventListener('click', () => {
    $('#yt-client-form').reset();
    $('#yt-client-form').classList.add('hidden');
  });
  $('#yt-redirect-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#yt-redirect').textContent); showToast(i18n.t('Copied.')); } catch (_) { /* sin portapapeles */ }
  });
  $('#yt-client-form').addEventListener('submit', async event => {
    event.preventDefault();
    const datos = Object.fromEntries(new FormData(event.target));
    try {
      await api('/api/accounts/youtube/client', { method: 'PUT', body: JSON.stringify(datos) });
      event.target.reset();
      event.target.classList.add('hidden');
      delete cuentas.results.youtube;
      showToast(i18n.t('OAuth client saved. Now press “Connect channel”.'));
      await load();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  // Vuelta del flujo de Google: /?cuentas=ok#accounts o /?cuentas=<mensaje>#accounts
  const vuelta = new URLSearchParams(location.search).get('cuentas');
  if (vuelta !== null) {
    const banner = $('#accounts-banner');
    banner.classList.remove('hidden');
    banner.classList.toggle('callout-bad', vuelta !== 'ok');
    banner.textContent = vuelta === 'ok' ? i18n.t('Channel connected. Press “Test connection” to confirm which channel it is.') : vuelta;
    history.replaceState(null, '', `/${location.hash}`);
  }

  window.renderAccounts = () => { load(); };
  if (location.hash.slice(1) === 'accounts') load();
})();
