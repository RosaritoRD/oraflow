/* global showToast */
// Perfil en la barra superior, como en KEIZAC TECH (05/10/2026): avatar con
// iniciales + nombre; al tocarlo, preferencias de ESTE usuario (tema, idioma,
// pantalla de inicio, modo compacto) y cerrar sesión. Se guardan en el servidor
// (/api/me/prefs) y se recuerdan en el navegador para que no parpadee al cargar.
(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VISTAS = [['overview', 'Hoy'], ['redes', 'Redes (Instagram y Facebook)'], ['pipeline', 'Vídeos en producción'], ['calendar', 'Calendario e ideas'],
    ['shorts', 'Shorts de versículos'], ['analytics', 'Resultados'], ['engagement', 'Comentarios'], ['research', 'Investigación'],
    ['operator', 'Piloto automático'], ['accounts', 'Cuentas'], ['settings', 'Ajustes del canal'], ['readiness', 'Revisión de producción'], ['docs', 'Guías']];
  let yo = null;
  const temaSistema = matchMedia('(prefers-color-scheme: light)');
  temaSistema.addEventListener('change', () => { if (yo?.prefs.tema === 'sistema') aplicaTema('sistema'); });

  function aplicaTema(tema) {
    const claro = tema === 'claro' || (tema === 'sistema' && temaSistema.matches);
    document.documentElement.dataset.theme = claro ? 'light' : 'dark';
  }
  function recuerda(prefs) {
    try { localStorage.setItem('kt_prefs', JSON.stringify(prefs)); localStorage.setItem('oraflow_language', prefs.idioma); } catch (_e) { /* modo privado */ }
  }

  // Antes de pintar nada: el tema y el modo compacto recordados en este navegador.
  try {
    const guardadas = JSON.parse(localStorage.getItem('kt_prefs') || 'null');
    if (guardadas) { aplicaTema(guardadas.tema); document.body.classList.toggle('compacto', Boolean(guardadas.compacto)); }
  } catch (_e) { /* sin almacenamiento */ }

  async function guarda(cambios) {
    const res = await fetch('/api/me/prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambios) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !data.prefs) throw new Error(data.error || 'No se pudo guardar');
    yo.prefs = data.prefs;
    recuerda(yo.prefs);
    return yo.prefs;
  }

  function pinta() {
    const barra = document.querySelector('.kbar');
    if (!barra || !yo) return;
    const chip = document.createElement('div');
    chip.className = 'kt-perfil';
    chip.innerHTML = `<button type="button" class="kt-perfil__btn" aria-label="Preferencias del perfil" aria-controls="kt-perfil-menu" aria-expanded="false" title="${esc(yo.correo)}">
        <span class="kt-perfil__av">${esc(yo.iniciales)}</span><span class="kt-perfil__nombre">${esc(yo.nombre)}</span></button>
      <div id="kt-perfil-menu" class="kt-perfil__menu" hidden role="region" aria-label="Preferencias del perfil">
        <div class="kt-perfil__cab"><span class="kt-perfil__av grande">${esc(yo.iniciales)}</span><div><b>${esc(yo.nombre)}</b><small>${esc(yo.correo)}</small></div></div>
        <label>Tema<select data-pref="tema"><option value="oscuro">Oscuro</option><option value="claro">Claro</option><option value="sistema">Como el teléfono</option></select></label>
        <label>Idioma del panel<select data-pref="idioma"><option value="es">Español</option><option value="en">English</option></select></label>
        <label>Pantalla al entrar<select data-pref="inicio">${VISTAS.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select></label>
        <label class="kt-perfil__check"><input type="checkbox" data-pref="compacto"> Vista compacta (menos espacio entre bloques)</label>
        <a class="kt-perfil__salir" href="/oauth2/sign_out?rd=%2F">Cerrar sesión</a>
      </div>`;
    barra.appendChild(chip); // a la derecha de todo, como el perfil de KEIZAC TECH
    document.querySelector('.kbar .language-control')?.setAttribute('hidden', ''); // el idioma ya está en el perfil
    const btn = chip.querySelector('.kt-perfil__btn');
    const menu = chip.querySelector('.kt-perfil__menu');
    for (const el of chip.querySelectorAll('[data-pref]')) {
      if (el.type === 'checkbox') el.checked = Boolean(yo.prefs[el.dataset.pref]); else el.value = yo.prefs[el.dataset.pref];
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
        showToast?.('Preferencia guardada');
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
    // Pantalla de inicio de este usuario (solo si no llegó con un #enlace concreto).
    if (!location.hash && yo.prefs.inicio && yo.prefs.inicio !== 'overview') location.hash = yo.prefs.inicio;
    pinta();
  }).catch(() => {});
})();
