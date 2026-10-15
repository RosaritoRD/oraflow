/* global i18n */
/* ============================================================
   Oraflow console enhancement layer — motion, command palette,
   instrumentation. Loads after app.js; touches nothing internal.
   Cross-file globals below are declared by app.js.
   ============================================================ */
/* global ui, renderNotifications */
(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const MINI_LABELS = {
    overview: i18n.t('Home'), research: i18n.t('Research'), shorts: i18n.t('Shorts'), clipping: i18n.t('Clipping'), operator: i18n.t('Operator'), pipeline: i18n.t('Pipeline'),
    calendar: i18n.t('Calendar'), analytics: i18n.t('Stats'), engagement: i18n.t('Audience'), readiness: i18n.t('Checks'), accounts: i18n.t('Accounts'), settings: i18n.t('Setup'), docs: i18n.t('Guides')
  };
  function ensureMiniLabels() {
    $$('.nav-item').forEach(item => {
      if (!item.querySelector('.mini-label')) {
        const span = document.createElement('span');
        span.className = 'mini-label';
        span.textContent = MINI_LABELS[item.dataset.view] || item.textContent.trim();
        item.appendChild(span);
      }
    });
  }
  ensureMiniLabels();

  /* ---------- 1. View choreography ---------- */
  const VIEW_META = {
    overview: [i18n.t('OPERATOR OVERVIEW'), i18n.t('Your channel, in production.'), i18n.t('Overview')],
    research: [i18n.t('RESEARCH INBOX'), i18n.t('Turn evidence into the next production.'), i18n.t('Research')],
    shorts: [i18n.t('VERSE SHORTS'), i18n.t('Verses in, shorts out.'), i18n.t('Shorts')],
    clipping: [i18n.t('CLIPPING'), i18n.t('Long videos into short clips.'), i18n.t('Clipping')],
    operator: [i18n.t('AUTONOMOUS OPERATOR'), i18n.t('Give Oraflow the strategy.'), i18n.t('Operator')],
    pipeline: [i18n.t('CONTENT OPERATIONS'), i18n.t('From idea to published.'), i18n.t('Pipeline')],
    calendar: [i18n.t('EDITORIAL PLANNING'), i18n.t('Plan before you generate.'), i18n.t('Calendar')],
    analytics: [i18n.t('PERFORMANCE'), i18n.t('Turn results into the next move.'), i18n.t('Analytics')],
    engagement: [i18n.t('AUDIENCE ENGAGEMENT'), i18n.t('Talk with the people watching.'), i18n.t('Engagement')],
    readiness: [i18n.t('PRODUCTION READINESS'), i18n.t('Verify before autonomy runs.'), i18n.t('Readiness')],
    accounts: [i18n.t('ACCOUNTS'), i18n.t('Every connection, tested.'), i18n.t('Accounts')],
    settings: [i18n.t('CHANNEL GUARDRAILS'), i18n.t('Make every agent sound like you.'), i18n.t('Setup')],
    docs: [i18n.t('GUIDES'), i18n.t('How to get the most out of Oraflow.'), i18n.t('Guides')]
  };
  let currentView = ui.currentView;
  // Si se entró por enlace (#docs…), la pestaña activa puede quedar fuera de la tira del móvil.
  if (matchMedia('(max-width: 900px)').matches) {
    requestAnimationFrame(() => document.querySelector('.nav-item.active')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
  }
  const baseSwitchView = window.switchView;
  if (typeof baseSwitchView === 'function') {
    window.switchView = function (view) {
      if (!VIEW_META[view]) return baseSwitchView(view);
      const changed = view !== currentView;
      const previous = currentView;
      currentView = view;
      baseSwitchView(view);
      // En el móvil el menú es una tira horizontal: trae la pestaña activa a la vista.
      document.querySelector(`.nav-item[data-view="${view}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      document.title = `${i18n.t(VIEW_META[view][2])} · Oraflow`;
      const section = $(`#${view}-view`);
      if (section) {
        // Directional slide: forward views enter from the right, back from the left.
        const order = Object.keys(VIEW_META);
        section.style.setProperty('--enter-from', order.indexOf(view) >= order.indexOf(previous) ? '1' : '-1');
        delete section.dataset.viewEnter;
        if (changed && !reduceMotion) {
          void section.offsetWidth; // restart animation
          section.dataset.viewEnter = 'true';
        }
        // Restagger static children + arm scroll reveals
        Array.from(section.children).forEach((child, i) => child.style.setProperty('--i', i));
        armReveals(section);
      }
    };
  }

  /* ---------- 2. Count-up instrumentation ---------- */
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function countUp(el) {
    if (!el || reduceMotion) return;
    const raw = (el.textContent || '').trim();
    const match = raw.match(/^(\d[\d,]*)(.*)$/);
    if (!match) return;
    const target = Number(match[1].replaceAll(',', ''));
    if (!Number.isFinite(target) || target === 0 || target > 100000) return;
    if (el.dataset.counted === String(target)) return;
    el.dataset.counted = String(target);
    const suffix = match[2];
    const dur = 750;
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = `${Math.round(target * easeOut(t)).toLocaleString(i18n.locale)}${suffix}`;
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  const origRenderDashboard = window.renderDashboard;
  if (typeof origRenderDashboard === 'function') {
    window.renderDashboard = function (...args) {
      origRenderDashboard.apply(this, args);
      // Rail pause/resume glyph follows real system state
      document.body.dataset.automationPaused = String(Boolean(ui.state?.system?.automationPaused));
      requestAnimationFrame(() => {
        ['#stat-review', '#stat-scheduled', '#stat-published', '#analytics-total'].forEach(s => countUp($(s)));
        const score = $('#stat-score');
        if (score && /\d/.test(score.textContent)) {
          const value = score.textContent.trim();
          if (score.dataset.animatedValue !== value) {
            score.dataset.animatedValue = value;
            score.classList.remove('score-pop');
            void score.offsetWidth;
            score.classList.add('score-pop');
          }
        }
      });
    };
  }

  /* ---------- 3. Command palette ---------- */
  const palette = document.createElement('div');
  palette.className = 'cmdk-backdrop hidden';
  palette.innerHTML = i18n.html`
    <div class="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
      <div class="cmdk-head">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input class="cmdk-input" type="text" placeholder="Jump to a view, run a command…" aria-label="Command input" autocomplete="off" spellcheck="false">
        <kbd>esc</kbd>
      </div>
      <div class="cmdk-list" role="listbox" aria-label="Commands"></div>
      <div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> run</span><span class="cmdk-brand">Oraflow console</span></div>
    </div>`;
  document.body.appendChild(palette);
  const listEl = palette.querySelector('.cmdk-list');
  const inputEl = palette.querySelector('.cmdk-input');

  // Palabras clave en español e inglés para que «configuración» encuentre "Channel setup".
  const VIEW_KEYWORDS = {
    overview: 'resumen inicio home dashboard panel',
    research: 'investigacion nichos ideas radar oportunidades',
    shorts: 'shorts versiculos biblia salmos lote fondos musica vertical',
    clipping: 'clipping clips recortar campana subtitulos whisper predica',
    operator: 'operador autonomo estrategia automatico',
    pipeline: 'produccion videos contenido revisar aprobar estados',
    calendar: 'calendario programados ideas backlog fechas',
    analytics: 'analitica estadisticas rendimiento resultados metricas',
    engagement: 'interaccion comentarios audiencia respuestas',
    readiness: 'preparacion comprobaciones checks verificar',
    accounts: 'cuentas claves api key oauth youtube conectar canal credenciales google configuracion configurar ajustes',
    settings: 'configuracion canal voz tono reglas setup',
    docs: 'guias ayuda documentacion manual tutorial como'
  };

  function buildCommands() {
    const cmds = Object.entries(VIEW_META).map(([id, meta]) => ({
      group: i18n.t('Navigate'), icon: 'view', label: meta[2] === 'Setup' ? i18n.t('Channel setup') : i18n.t(meta[2]),
      hint: meta[1], keywords: `${id} ${VIEW_KEYWORDS[id] || ''}`, run: () => window.switchView(id)
    }));
    const action = (label, hint, selector, keywords) => ({
      group: i18n.t('Actions'), icon: 'action', label, hint, keywords,
      run: () => { const el = $(selector); if (el) el.click(); }
    });
    const goAndClick = (view, selector) => () => {
      window.switchView(view);
      setTimeout(() => $(selector)?.click(), 120);
    };
    cmds.push(
      action(i18n.t('Create video'), i18n.t('Queue a new generation job'), '#generate-button', 'generate new video create crear nuevo generar'),
      { group: i18n.t('Actions'), icon: 'action', label: i18n.t('Make all shorts'), hint: i18n.t('Render every short in the batch'), keywords: 'hacer shorts versiculos render lote', run: goAndClick('shorts', '#shorts-run') },
      { group: i18n.t('Actions'), icon: 'action', label: i18n.t('Upload background videos'), hint: i18n.t('Pexels, Pixabay or your own'), keywords: 'subir fondos videos fondo', run: goAndClick('shorts', '[data-shorts-upload="fondos"]') },
      { group: i18n.t('Actions'), icon: 'action', label: i18n.t('Upload music'), hint: i18n.t('YouTube Audio Library tracks'), keywords: 'subir musica audio pistas', run: goAndClick('shorts', '[data-shorts-upload="musica"]') },
      { group: i18n.t('Actions'), icon: 'action', label: i18n.t('Upload a video to clip'), hint: i18n.t('Campaign material'), keywords: 'subir video clipping campana', run: goAndClick('clipping', '[data-shorts-upload="clipping"]') },
      { group: i18n.t('Actions'), icon: 'action', label: i18n.t('Test every account'), hint: i18n.t('Check all keys and the channel'), keywords: 'probar cuentas claves test conexion', run: goAndClick('accounts', '#accounts-test-all') },
      { group: i18n.t('Actions'), icon: 'action', label: i18n.t('Connect YouTube channel'), hint: i18n.t('Give Oraflow permission to publish'), keywords: 'conectar canal youtube oauth permiso publicar', run: () => { location.href = '/api/accounts/youtube/connect'; } },
      action(i18n.t('Add backlog idea'), i18n.t('Save a topic for later'), '#add-idea-button', 'idea backlog topic anadir idea'),
      action(i18n.t('Run verified readiness check'), i18n.t('Prove the production path'), '#run-readiness-button', 'readiness verify dry run check comprobar'),
      ui.state?.system?.automationPaused
        ? action(i18n.t('Resume automation'), i18n.t('Unpause the scheduler'), '#automation-toggle', 'resume unpause automation play reanudar')
        : action(i18n.t('Pause automation'), i18n.t('Halt scheduled generation'), '#automation-toggle', 'pause halt automation stop pausar'),
      action(i18n.t('Refresh dashboard data'), i18n.t('Pull latest state now'), '#refresh-button', 'refresh reload sync data actualizar'),
      action(i18n.t('Set dashboard API key'), i18n.t('Store access key in this browser'), '#api-key-button', 'api key auth credentials clave')
    );
    return cmds;
  }

  /* Contenido: solo aparece al escribir, para que la lista inicial siga corta. */
  function contentCommands() {
    const cmds = [];
    for (const item of ui.state?.pipeline || []) {
      cmds.push({ group: i18n.t('Videos'), icon: 'video', label: item.title || i18n.t('Untitled content'), hint: item.topic || '', keywords: item.review_status || '', data: true,
        run: () => { window.switchView('pipeline'); window.openContent?.(item.id); } });
    }
    for (const idea of ui.state?.ideas || []) {
      cmds.push({ group: i18n.t('Ideas'), icon: 'idea', label: idea.topic || '', hint: idea.angle || idea.rationale || '', keywords: '', data: true,
        run: () => window.switchView('calendar') });
    }
    for (const s of ui.shorts?.state?.outputs?.shorts || []) {
      cmds.push({ group: i18n.t('Shorts'), icon: 'video', label: s.ficha?.title || s.name, hint: s.name, keywords: s.ficha?.description || '', data: true,
        run: () => window.switchView('shorts') });
    }
    for (const g of window.agentGuides || []) {
      cmds.push({ group: i18n.t('Guides'), icon: 'guide', label: g.title, hint: g.summary, keywords: g.keywords,
        run: () => window.openGuide(g.slug) });
    }
    return cmds;
  }

  let filtered = [];
  let selected = 0;

  const ICONS = {
    view: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    action: '<path d="M13 2 4.5 13.5H11l-1 8.5 9-12h-6.5z"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
    idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    guide: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H11v17H5.5A1.5 1.5 0 0 1 4 18.5zM20 4.5A1.5 1.5 0 0 0 18.5 3H13v17h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>'
  };
  function icon(kind) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind] || ICONS.view}</svg>`;
  }

  function renderList() {
    const raw = inputEl.value;
    const q = raw.trim();
    const core = window.searchCore;
    const cmds = q ? [...buildCommands(), ...contentCommands()] : buildCommands();
    filtered = core
      ? core.rank(cmds, q, { limitPerGroup: { [i18n.t('Videos')]: 6, [i18n.t('Ideas')]: 4, [i18n.t('Shorts')]: 4, [i18n.t('Guides')]: 4 } })
      : cmds.filter(c => `${c.label} ${c.hint} ${c.keywords}`.toLowerCase().includes(q.toLowerCase()));
    selected = Math.min(selected, Math.max(0, filtered.length - 1));
    if (!filtered.length) {
      listEl.innerHTML = `<div class="cmdk-empty">${escapeHTML(i18n.t('No results for'))} “${escapeHTML(q)}”.<br><small>${escapeHTML(i18n.t('Try fewer words, or search the guides.'))}</small></div>`;
      return;
    }
    // Todo lo que viene de datos (títulos de videos, ideas…) se escapa antes de pintarse.
    const mark = text => (core ? core.highlight(text, q, escapeHTML) : escapeHTML(text));
    let lastGroup = '';
    listEl.innerHTML = filtered.map((c, i) => {
      const head = c.group !== lastGroup ? `<p class="cmdk-group">${escapeHTML(c.group)}</p>` : '';
      lastGroup = c.group;
      return `${head}<div class="cmdk-row ${i === selected ? 'selected' : ''}" role="option" aria-selected="${i === selected}" data-cmd="${i}">
        <span class="cmdk-icon">${icon(c.icon)}</span>
        <span class="cmdk-label">${mark(c.label)}</span>
        <span class="cmdk-hint">${mark(String(c.hint || '').slice(0, 90))}</span>
      </div>`;
    }).join('');
    listEl.querySelector('.cmdk-row.selected')?.scrollIntoView({ block: 'nearest' });
  }

  function openPalette() {
    palette.classList.remove('hidden');
    document.body.classList.add('cmdk-open');
    inputEl.value = '';
    selected = 0;
    renderList();
    requestAnimationFrame(() => inputEl.focus());
  }
  function closePalette() {
    palette.classList.add('hidden');
    document.body.classList.remove('cmdk-open');
  }
  function runCommand(index) {
    const cmd = filtered[index];
    if (!cmd) return;
    closePalette();
    setTimeout(() => cmd.run(), 60);
  }

  palette.addEventListener('click', event => {
    if (event.target === palette) return closePalette();
    const row = event.target.closest('[data-cmd]');
    if (row) runCommand(Number(row.dataset.cmd));
  });
  inputEl.addEventListener('input', () => { selected = 0; renderList(); });

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      return palette.classList.contains('hidden') ? openPalette() : closePalette();
    }
    if (!palette.classList.contains('hidden')) {
      if (event.key === 'Escape') { event.preventDefault(); return closePalette(); }
      if (event.key === 'ArrowDown') { event.preventDefault(); selected = Math.min(filtered.length - 1, selected + 1); return renderList(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); selected = Math.max(0, selected - 1); return renderList(); }
      if (event.key === 'Enter') { event.preventDefault(); return runCommand(selected); }
      return;
    }
    // Typing guard: chords only outside form fields
    const tag = event.target.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target.isContentEditable;
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === '/') { event.preventDefault(); return openPalette(); }
    if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      if (!$('#generate-button').disabled) $('#generate-dialog').showModal();
      return;
    }
    // g-chords: g o → overview, g p → pipeline …
    if (event.key.toLowerCase() === 'g') {
      chordArmed = true;
      clearTimeout(chordTimer);
      chordTimer = setTimeout(() => { chordArmed = false; }, 1200);
      return;
    }
    if (chordArmed) {
      const map = { o: 'overview', e: 'research', v: 'shorts', k: 'clipping', p: 'pipeline', c: 'calendar', a: 'analytics', r: 'readiness', s: 'settings', d: 'operator', u: 'accounts', h: 'docs' };
      const view = map[event.key.toLowerCase()];
      chordArmed = false;
      clearTimeout(chordTimer);
      if (view) { event.preventDefault(); window.switchView(view); }
    }
  });
  let chordArmed = false;
  let chordTimer = null;

  // Visible trigger in the topbar
  const trigger = document.createElement('button');
  trigger.className = 'kbd-trigger';
  trigger.setAttribute('aria-label', i18n.t('Open command palette'));
  trigger.innerHTML = i18n.markup('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Search</span><kbd>Ctrl K</kbd>');
  trigger.addEventListener('click', openPalette);
  $('.top-actions').prepend(trigger);

  /* ---------- 4. Composited cursor spotlight ---------- */
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!reduceMotion && finePointer) {
    const spotlight = $('.spotlight');
    let spotlightRaf = 0;
    let pointerX = -600;
    let pointerY = -600;
    document.addEventListener('pointermove', event => {
      if (!spotlight) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!document.body.classList.contains('has-pointer')) document.body.classList.add('has-pointer');
      if (spotlightRaf) return;
      spotlightRaf = requestAnimationFrame(() => {
        spotlightRaf = 0;
        spotlight.style.transform = `translate3d(${pointerX - 280}px, ${pointerY - 280}px, 0)`;
      });
    }, { passive: true });
  }

  /* ---------- 5. Button ripple ---------- */
  if (!reduceMotion) {
    document.addEventListener('pointerdown', event => {
      const button = event.target.closest('.button.primary, .button.secondary, .nav-item');
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      const size = Math.max(rect.width, rect.height) * 2.1;
      ripple.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - rect.left - size / 2}px;top:${event.clientY - rect.top - size / 2}px`;
      button.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  }

  /* ---------- 6. Scroll reveals (static panels only) ---------- */
  const io = 'IntersectionObserver' in window && !reduceMotion
    ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        }
      }
    }, { threshold: .06, rootMargin: '0px 0px -36px 0px' })
    : null;
  function armReveals(scope) {
    if (!io) return;
    (scope || document).querySelectorAll('.panel:not(.revealed)').forEach(panel => {
      panel.classList.add('reveal');
      io.observe(panel);
    });
  }

  /* ---------- 7. Sticky topbar elevation ---------- */
  const topbar = $('.topbar');
  window.addEventListener('scroll', () => {
    document.body.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
  if (topbar) armReveals(document);

  /* ---------- 8. Toast v2 (icon + slide, keeps API) ---------- */
  const origShowToast = window.showToast;
  if (typeof origShowToast === 'function') {
    window.showToast = function (message, type = 'success') {
      const toast = $('#toast');
      const iconPath = type === 'error'
        ? i18n.markup('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5.5M12 16.5v.5"/></svg>')
        : type === 'warning'
          ? i18n.markup('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.5 20h19z"/><path d="M12 10v4M12 17v.5"/></svg>')
          : i18n.markup('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="m8 12.5 2.8 2.8L16.5 9"/></svg>');
      toast.innerHTML = i18n.html`<span class="toast-icon ${type}">${iconPath}</span><span class="toast-msg"></span>`;
      toast.querySelector('.toast-msg').textContent = message;
      toast.className = `toast ${type}`;
      void toast.offsetWidth;
      toast.classList.add('armed');
      clearTimeout(ui.toastTimer);
      ui.toastTimer = setTimeout(() => toast.classList.add('hidden'), 4200);
    };
  }

  /* ---------- 9. Live relative-time ticker ---------- */
  setInterval(() => {
    if (ui.state && ui.currentView === 'overview' && !ui.refreshing && !document.hidden) {
      try {
        renderNotifications(ui.state.notifications || [], ui.state.events || []);
      } catch { /* next tick */ }
    }
  }, 30000);

  /* ---------- 10. Sidebar status cluster (clock + version) ---------- */
  const footer = $('.sidebar-footer');
  if (footer) {
    const cluster = document.createElement('div');
    cluster.className = 'console-meta';
    cluster.innerHTML = i18n.html`
      <div class="console-clock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg><span>--:--</span></div>
      <span class="console-version">v2.8.0 · local</span>`;
    footer.prepend(cluster);
    const clockLabel = cluster.querySelector('.console-clock span');
    const tickClock = () => {
      clockLabel.textContent = new Date().toLocaleTimeString(i18n.locale, { hour: '2-digit', minute: '2-digit' });
    };
    tickClock();
    setInterval(tickClock, 15000);
  }

  /* ---------- 11. First-paint boot sequence ---------- */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.documentElement.classList.remove('preboot');
    armReveals($('.view.active'));
  }));
})();
