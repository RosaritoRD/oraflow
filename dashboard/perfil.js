/* global showToast, i18n */
// Profile in the top bar (05/10/2026): avatar with initials + name; tapping it
// opens THIS user's preferences (theme, language, start screen, compact mode)
// and sign-out. They're stored on the server (/api/me/prefs) and remembered in
// the browser so nothing flickers on load.
(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = s => i18n.t(s);
  const VISTAS = [['overview', 'Today'], ['redes', 'Social (Instagram and Facebook)'], ['msj-resumen', 'Messages (overview)'], ['msj-bandeja', 'Messages (inbox)'], ['pipeline', 'Videos in production'], ['calendar', 'Calendar and ideas'],
    ['shorts', 'Verse Shorts'], ['analytics', 'Results'], ['engagement', 'Comments'], ['research', 'Research'],
    ['operator', 'Autopilot'], ['accounts', 'Accounts'], ['settings', 'Channel settings'], ['readiness', 'Production review'], ['docs', 'Guides']];
  let yo = null;
  const temaSistema = matchMedia('(prefers-color-scheme: light)');
  temaSistema.addEventListener('change', () => { if (yo?.prefs.tema === 'sistema') aplicaTema('sistema'); });

  function aplicaTema(tema) {
    const claro = tema === 'claro' || (tema === 'sistema' && temaSistema.matches);
    document.documentElement.dataset.theme = claro ? 'light' : 'dark';
  }
  function recuerda(prefs) {
    try { localStorage.setItem('kt_prefs', JSON.stringify(prefs)); if (prefs.idioma) localStorage.setItem('oraflow_language', prefs.idioma); } catch (_e) { /* private mode */ }
  }

  // Before drawing anything: the theme and compact mode remembered in this browser.
  try {
    const guardadas = JSON.parse(localStorage.getItem('kt_prefs') || 'null');
    if (guardadas) { aplicaTema(guardadas.tema); document.body.classList.toggle('compacto', Boolean(guardadas.compacto)); }
  } catch (_e) { /* no storage */ }

  async function guarda(cambios) {
    const res = await fetch('/api/me/prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambios) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !data.prefs) throw new Error(data.error || t('Could not save'));
    yo.prefs = data.prefs;
    recuerda(yo.prefs);
    return yo.prefs;
  }

  function pinta() {
    const barra = document.querySelector('.kbar');
    if (!barra || !yo) return;
    const chip = document.createElement('div');
    chip.className = 'kt-perfil';
    chip.innerHTML = `<button type="button" class="kt-perfil__btn" aria-label="${esc(t('Profile preferences'))}" aria-controls="kt-perfil-menu" aria-expanded="false" title="${esc(yo.correo)}">
        <span class="kt-perfil__av">${esc(yo.iniciales)}</span><span class="kt-perfil__nombre">${esc(yo.nombre)}</span></button>
      <div id="kt-perfil-menu" class="kt-perfil__menu" hidden role="region" aria-label="${esc(t('Profile preferences'))}">
        <div class="kt-perfil__cab"><span class="kt-perfil__av grande">${esc(yo.iniciales)}</span><div><b>${esc(yo.nombre)}</b><small>${esc(yo.correo)}</small></div></div>
        <label>${esc(t('Theme'))}<select data-pref="tema"><option value="oscuro">${esc(t('Dark'))}</option><option value="claro">${esc(t('Light'))}</option><option value="sistema">${esc(t('Like the phone'))}</option></select></label>
        <label>${esc(t('Panel language'))}<select data-pref="idioma"><option value="es">Español</option><option value="en">English</option></select></label>
        <label>${esc(t('Start screen'))}<select data-pref="inicio">${VISTAS.map(([v, n]) => `<option value="${v}">${esc(t(n))}</option>`).join('')}</select></label>
        <label class="kt-perfil__check"><input type="checkbox" data-pref="compacto"> ${esc(t('Compact view (less space between blocks)'))}</label>
        <a class="kt-perfil__salir" href="/oauth2/sign_out?rd=%2F">${esc(t('Sign out'))}</a>
      </div>`;
    barra.appendChild(chip); // far right
    document.querySelector('.kbar .language-control')?.setAttribute('hidden', ''); // language already lives in the profile
    const btn = chip.querySelector('.kt-perfil__btn');
    const menu = chip.querySelector('.kt-perfil__menu');
    for (const el of chip.querySelectorAll('[data-pref]')) {
      if (el.type === 'checkbox') el.checked = Boolean(yo.prefs[el.dataset.pref]); else el.value = yo.prefs[el.dataset.pref] ?? (el.dataset.pref === 'idioma' ? i18n.language : '');
    }
    btn.addEventListener('click', () => { menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); });
    const cierra = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    document.addEventListener('click', e => { if (!chip.contains(e.target)) cierra(); });
    chip.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); cierra(); btn.focus(); }
      if (e.key === 'ArrowDown' && e.target === btn) { e.preventDefault(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); menu.querySelector('select').focus(); }
    });
    chip.addEventListener('focusout', e => { if (e.relatedTarget && !chip.contains(e.relatedTarget)) cierra(); });
    let guardando = false;
    chip.addEventListener('change', async e => {
      const el = e.target.closest('[data-pref]');
      if (!el || guardando) return;
      const valor = el.type === 'checkbox' ? el.checked : el.value;
      const anterior = yo.prefs[el.dataset.pref];
      guardando = true;
      const campos = chip.querySelectorAll('[data-pref]');
      campos.forEach(campo => { campo.disabled = true; });
      menu.setAttribute('aria-busy', 'true');
      try {
        const prefs = await guarda({ [el.dataset.pref]: valor });
        if (el.dataset.pref === 'tema') aplicaTema(prefs.tema);
        if (el.dataset.pref === 'compacto') document.body.classList.toggle('compacto', prefs.compacto);
        if (el.dataset.pref === 'idioma') { location.reload(); return; }
        showToast?.(t('Preference saved'));
      } catch (error) {
        if (el.type === 'checkbox') el.checked = Boolean(anterior); else el.value = anterior;
        showToast?.(error.message, 'error');
      } finally {
        guardando = false;
        campos.forEach(campo => { campo.disabled = false; });
        menu.setAttribute('aria-busy', 'false');
      }
    });
  }

  fetch('/api/me').then(r => r.json()).then(d => {
    if (!d.success) return;
    yo = d;
    recuerda(yo.prefs);
    aplicaTema(yo.prefs.tema);
    document.body.classList.toggle('compacto', Boolean(yo.prefs.compacto));
    // This user's start screen (only if they didn't arrive through a specific #link).
    if (!location.hash && yo.prefs.inicio && yo.prefs.inicio !== 'overview') location.hash = yo.prefs.inicio;
    pinta();
  }).catch(() => {});
})();
