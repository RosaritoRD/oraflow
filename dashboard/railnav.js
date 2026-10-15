/* global i18n, ui */
// Megamenú lateral estilo KEIZAC (copia de la forma del panel de keizac-web:
// js/meganav.js + css/meganav.css en modo `body.sidenav`). Columna negra con
// pocas pestañas; cada una abre AL LADO, a la altura de su fila, un panel con
// las opciones agrupadas. En el móvil, cajón con acordeones.
//
// El menú viejo (`.nav-item`) se queda en el DOM, oculto: app.js y enhance.js
// cuentan con él para el estado activo y para navegar por #hash.
(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const t = s => i18n.t(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CLOSE_DELAY = 140;
  // Oraflow entra desde el megamenú de Keizac como un producto más (igual que
  // Fleet): este botón es su «← Panel principal» de vuelta, en la misma pestaña.
  const KEIZAC_PANEL = 'https://tu-dominio.com/admin'; // ms de gracia al pasar el ratón de la pestaña al panel (igual que Keizac)

  /* Pestañas → grupos → opciones. `view` navega a una pantalla; `action` pulsa
     un botón existente; `guide` abre una guía. Etiquetas en inglés = claves
     del catálogo de i18n.js. */
  function menu() {
    const guias = (window.agentGuides || []).map(g => ({ raw: g.title, guide: g.slug }));
    // 05/10/2026: menú por áreas (YouTube · Redes · Resultados…), pedido del autor.
    return [
      { id: 'today', label: 'Today', view: 'overview', home: true },
      { id: 'youtube', label: 'YouTube', columns: [
        { title: 'Videos', items: [{ label: 'Create video', action: '#generate-button' }, { label: 'Pipeline', view: 'pipeline' }] },
        { title: 'Shorts', items: [{ label: 'Verse Shorts', view: 'shorts' }, { label: 'Clipping', view: 'clipping' }] },
        { title: 'Plan', items: [{ label: 'Calendar & ideas', view: 'calendar' }, { label: 'Research', view: 'research' }, { label: 'Autonomous operator', view: 'operator' }] }
      ] },
      { id: 'social', label: 'Redes', columns: [
        { title: 'Instagram y Facebook', items: [{ raw: 'Publicaciones diarias', view: 'redes' }, { raw: 'Historia de hoy', href: '/historia' }, { raw: 'Portadas para subir', href: '/portadas' }] },
        { title: 'Comentarios', items: [{ label: 'Engagement', view: 'engagement' }, { raw: 'Respuestas «Amén»', view: 'redes' }] },
        { title: 'Ajustes', items: [{ raw: 'Textos y enlaces', view: 'redes' }, { raw: 'Libro (página de venta)', href: 'https://tu-dominio.com/libro' }] }
      ] },
      { id: 'results', label: 'Results', columns: [
        { title: 'Performance', items: [{ label: 'Analytics', view: 'analytics' }] }
      ] },
      { id: 'system', label: 'System', columns: [
        { title: 'Production', items: [{ label: 'Production readiness', view: 'readiness' }] },
        { title: 'Accounts & channel', items: [{ label: 'Accounts', view: 'accounts' }, { label: 'Channel setup', view: 'settings' }] }
      ] },
      { id: 'help', label: 'Help', columns: [
        { title: 'Guides', items: guias.length ? guias : [{ label: 'Guides', view: 'docs' }] },
        { title: 'Shortcuts', items: [{ label: 'Search everything', action: 'palette', hint: 'Ctrl K' }] }
      ] }
    ];
  }

  const CHEV = '<svg class="rnav__chev" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>';
  const BURGER = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>';
  const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
  const ACC = '<svg class="rnav__chev" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

  const etiqueta = it => (it.raw ? it.raw : t(it.label));
  const destino = it => (it.view ? `data-view-go="${esc(it.view)}"` : it.guide ? `data-guide-go="${esc(it.guide)}"` : `data-action-go="${esc(it.action)}"`);

  function optionHtml(it) {
    if (it.href) {
      return `<a class="rnav-opt" role="menuitem" tabindex="-1" href="${esc(it.href)}" target="_blank" rel="noopener">
      <span class="rnav-opt__dot" aria-hidden="true"></span><span class="rnav-opt__txt">${esc(etiqueta(it))}</span></a>`;
    }
    return `<button type="button" class="rnav-opt" role="menuitem" tabindex="-1" ${destino(it)}>
      <span class="rnav-opt__dot" aria-hidden="true"></span><span class="rnav-opt__txt">${esc(etiqueta(it))}</span>${it.hint ? `<kbd>${esc(it.hint)}</kbd>` : ''}</button>`;
  }
  function columnsHtml(cols) {
    return cols.map(c => `<div class="rnav-col"><div class="rnav-col__h">${esc(t(c.title))}</div>${c.items.map(optionHtml).join('')}</div>`).join('');
  }

  /* ── montaje ── */
  const sidebar = $('.sidebar');
  const rail = document.createElement('div');
  rail.className = 'rnav';
  sidebar.prepend(rail);
  const panels = document.createElement('div');
  panels.className = 'rnav__panels';
  document.body.appendChild(panels);

  // Barra superior fija (buscador, idioma, actualizar, crear): se MUEVEN los
  // controles existentes, así sus ids y manejadores siguen siendo los mismos.
  const bar = document.createElement('div');
  bar.className = 'kbar';
  bar.innerHTML = `<button type="button" class="kbar__burger" aria-expanded="false">${BURGER}</button>
    <a class="kbar__brand" href="#overview"><img src="/assets/logo-icon.png" alt="" width="28" height="28"><span>KEIZAC<em>&nbsp;Tube</em></span></a>
    <span class="kbar__channel" title="Channel"></span><div class="kbar__right"></div>`;
  document.body.appendChild(bar);
  bar.querySelector('.kbar__burger').setAttribute('aria-label', t('Open menu'));
  const nombreCanal = $('#brand-name');
  if (nombreCanal) bar.querySelector('.kbar__channel').appendChild(nombreCanal);
  const acciones = $('.top-actions');
  if (acciones) bar.querySelector('.kbar__right').appendChild(acciones);

  const drawer = document.createElement('div');
  drawer.className = 'rnav__drawer';
  drawer.hidden = true;
  document.body.appendChild(drawer);

  let openId = null;
  let closeTimer = null;

  function build() {
    const tabs = menu();
    rail.innerHTML = `<a class="rnav__brand" href="#overview"><img src="/assets/logo-icon.png" alt="" width="30" height="30"><span>KEIZAC<em>&nbsp;Tube</em></span></a>
      <a class="rnav__back" href="${KEIZAC_PANEL}">${esc(t('← Main panel'))}</a>
      <nav class="rnav__tabs" role="menubar" aria-label="${esc(t('Main navigation'))}">${tabs.map(tab => `
        <button type="button" class="rnav__tab${tab.home ? ' is-home' : ''}" role="menuitem" data-tab="${tab.id}"
          ${tab.home ? `data-view-go="${tab.view}"` : `aria-haspopup="true" aria-expanded="false" aria-controls="rnav-panel-${tab.id}"`}>
          <span>${esc(t(tab.label))}</span>${tab.home ? '' : CHEV}</button>`).join('')}
      </nav>`;
    panels.innerHTML = tabs.filter(tab => !tab.home).map(tab => `
      <section class="rnav__panel" id="rnav-panel-${tab.id}" data-tab="${tab.id}" role="menu" aria-label="${esc(t(tab.label))}" hidden>
        <div class="rnav__panel-inner">${columnsHtml(tab.columns)}</div></section>`).join('');
    drawer.innerHTML = `<div class="rnav__drawer-head"><span>${esc(t('Menu'))}</span>
        <button type="button" class="rnav__drawer-close" aria-label="${esc(t('Close'))}">${CLOSE}</button></div>
      <div class="rnav__drawer-body"><a class="rnav-acc__home rnav__back" href="${KEIZAC_PANEL}">${esc(t('← Main panel'))}</a>${tabs.map(tab => (tab.home
        ? `<button type="button" class="rnav-acc__home" data-view-go="${tab.view}">${esc(t(tab.label))}</button>`
        : `<div class="rnav-acc"><button type="button" class="rnav-acc__h" aria-expanded="false"><span>${esc(t(tab.label))}</span>${ACC}</button>
            <div class="rnav-acc__body" hidden>${columnsHtml(tab.columns)}</div></div>`)).join('')}
        <div class="rnav-lang"><span>${esc(t('Interface language'))}</span>
          <div class="rnav-lang__seg">${['es', 'en'].map(l => `<button type="button" data-lang="${l}" class="${i18n.language === l ? 'is-on' : ''}">${l.toUpperCase()}</button>`).join('')}</div></div>
      </div>`;
    marcarActual();
  }

  /* ── pestaña de la pantalla actual ── */
  function tabDeVista(view) {
    for (const tab of menu()) {
      if (tab.home && tab.view === view) return tab.id;
      if ((tab.columns || []).some(c => c.items.some(i => i.view === view))) return tab.id;
    }
    return view === 'docs' ? 'help' : null;
  }
  function marcarActual() {
    const actual = tabDeVista(ui.currentView);
    rail.querySelectorAll('.rnav__tab').forEach(b => b.classList.toggle('is-current', b.dataset.tab === actual));
    document.querySelectorAll('.rnav-opt[data-view-go]').forEach(o => o.classList.toggle('is-current', o.dataset.viewGo === ui.currentView));
  }

  /* ── abrir / cerrar paneles ── */
  const panelOf = id => panels.querySelector(`.rnav__panel[data-tab="${id}"]`);
  const tabOf = id => rail.querySelector(`.rnav__tab[data-tab="${id}"]`);
  function openTab(id) {
    cancelClose();
    if (openId === id) return;
    if (openId) closeTab(openId);
    const p = panelOf(id);
    const b = tabOf(id);
    if (!p || !b) return;
    openId = id;
    b.classList.add('is-open');
    b.setAttribute('aria-expanded', 'true');
    p.hidden = false;
    // A la altura de su fila (como Keizac); si no cabe, se sube lo justo.
    const MIN = 72;
    const arriba = Math.max(MIN, b.getBoundingClientRect().top - 6);
    const tope = Math.max(MIN, innerHeight - p.scrollHeight - 12);
    p.style.setProperty('--rnav-top', `${Math.min(arriba, tope)}px`);
    if (!reduceMotion()) { p.classList.remove('anim'); void p.offsetWidth; p.classList.add('anim'); }
  }
  function closeTab(id) {
    const p = panelOf(id);
    const b = tabOf(id);
    if (p) p.hidden = true;
    if (b) { b.classList.remove('is-open'); b.setAttribute('aria-expanded', 'false'); }
    if (openId === id) openId = null;
  }
  const closeAll = () => { if (openId) closeTab(openId); };
  function scheduleClose() { clearTimeout(closeTimer); closeTimer = setTimeout(closeAll, CLOSE_DELAY); }
  function cancelClose() { clearTimeout(closeTimer); }

  /* ── ejecutar una opción ── */
  function ir(el) {
    closeAll();
    cerrarCajon();
    if (el.dataset.viewGo) return window.switchView(el.dataset.viewGo);
    if (el.dataset.guideGo) return window.openGuide?.(el.dataset.guideGo);
    const accion = el.dataset.actionGo;
    if (accion === 'palette') return $('.kbd-trigger')?.click();
    $(accion)?.click();
  }

  rail.addEventListener('mouseover', e => {
    const b = e.target.closest('.rnav__tab[aria-haspopup]');
    if (b) openTab(b.dataset.tab);
    else if (e.target.closest('.rnav__tab')) closeAll();
  });
  rail.addEventListener('mouseleave', scheduleClose);
  panels.addEventListener('mouseover', cancelClose);
  panels.addEventListener('mouseleave', scheduleClose);
  rail.addEventListener('click', e => {
    const b = e.target.closest('.rnav__tab');
    if (!b) return;
    if (b.dataset.viewGo) return ir(b);
    if (openId === b.dataset.tab) closeTab(b.dataset.tab); else openTab(b.dataset.tab);
  });
  document.addEventListener('click', e => {
    const opt = e.target.closest('.rnav-opt, .rnav-acc__home');
    if (opt) return ir(opt);
    if (!rail.contains(e.target) && !panels.contains(e.target)) closeAll();
  });

  // Teclado (menubar/menu de ARIA, como Keizac): flechas, Enter, Escape.
  rail.addEventListener('keydown', e => {
    const b = e.target.closest('.rnav__tab');
    if (!b) return;
    const tabs = [...rail.querySelectorAll('.rnav__tab')];
    const i = tabs.indexOf(b);
    if (e.key === 'ArrowDown') { e.preventDefault(); tabs[(i + 1) % tabs.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); tabs[(i - 1 + tabs.length) % tabs.length].focus(); }
    else if ((e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') && b.getAttribute('aria-haspopup')) {
      e.preventDefault();
      openTab(b.dataset.tab);
      panelOf(b.dataset.tab)?.querySelector('.rnav-opt')?.focus();
    } else if (e.key === 'Escape') closeAll();
  });
  panels.addEventListener('keydown', e => {
    const p = e.target.closest('.rnav__panel');
    if (!p) return;
    const opts = [...p.querySelectorAll('.rnav-opt')];
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); opts[Math.min(i + 1, opts.length - 1)].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) { closeTab(p.dataset.tab); tabOf(p.dataset.tab).focus(); } else opts[i - 1].focus(); }
    else if (e.key === 'ArrowLeft' || e.key === 'Escape') { e.preventDefault(); closeTab(p.dataset.tab); tabOf(p.dataset.tab).focus(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAll(); cerrarCajon(); } });

  /* ── cajón del móvil: acordeón de verdad (abrir una cierra las demás) ── */
  function cerrarCajon() {
    if (drawer.hidden) return;
    drawer.hidden = true;
    bar.querySelector('.kbar__burger').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('rnav-locked');
  }
  bar.querySelector('.kbar__burger').addEventListener('click', () => {
    if (!drawer.hidden) return cerrarCajon();
    drawer.querySelectorAll('.rnav-acc__h').forEach(h => { h.setAttribute('aria-expanded', 'false'); h.nextElementSibling.hidden = true; });
    drawer.hidden = false;
    bar.querySelector('.kbar__burger').setAttribute('aria-expanded', 'true');
    document.body.classList.add('rnav-locked');
  });
  drawer.addEventListener('click', e => {
    if (e.target.closest('.rnav__drawer-close')) return cerrarCajon();
    // Idioma desde el cajón: en el móvil el selector de la barra no cabe.
    const lang = e.target.closest('[data-lang]');
    if (lang) {
      const sel = $('#language-select');
      if (sel && sel.value !== lang.dataset.lang) { sel.value = lang.dataset.lang; sel.dispatchEvent(new Event('change')); }
      return;
    }
    const h = e.target.closest('.rnav-acc__h');
    if (!h) return;
    const abrir = h.getAttribute('aria-expanded') !== 'true';
    drawer.querySelectorAll('.rnav-acc__h').forEach(o => { o.setAttribute('aria-expanded', 'false'); o.nextElementSibling.hidden = true; });
    h.setAttribute('aria-expanded', String(abrir));
    h.nextElementSibling.hidden = !abrir;
  });

  // Seguir la pantalla actual: se envuelve switchView (ya envuelto por enhance.js).
  const base = window.switchView;
  window.switchView = view => { base(view); marcarActual(); };
  addEventListener('hashchange', () => setTimeout(marcarActual, 0));

  build();
  document.body.classList.add('keizac-shell');
})();
