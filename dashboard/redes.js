/* global ui, api, escapeHTML, showToast */
// Área «Redes» (05/10/2026): lo que sale solo en Instagram y Facebook, con su
// hora y su último resultado, más la historia de hoy y las respuestas a los Amén.
(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const esc = t => escapeHTML(String(t ?? ''));
  const redes = ui.redes = { piezas: null };
  const NOMBRE_RED = { instagram: 'Instagram', facebook: 'Facebook', instagram_carrusel: 'Instagram (carrusel)', instagram_reel: 'Instagram (Reel)', facebook_reel: 'Facebook (Reel)', panel: 'Panel /historia' };

  function chipRed(nombre, r) {
    if (!r) return '';
    const ok = r.status === 'published' || r.status === 'listo';
    const enlace = r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener">ver</a>` : '';
    return `<li><span class="status ${ok ? 'approved' : 'failed'}">${ok ? 'Publicado' : 'Falló'}</span> ${esc(NOMBRE_RED[nombre] || nombre)}${enlace}
      ${ok ? '' : `<small class="redes-error">${esc(r.error || '')}</small>`}</li>`;
  }

  function estadoAmen(p) {
    const e = p.redesEstado;
    if (!e) return '';
    const nombres = { youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook' };
    const hora = t => new Date(t).toLocaleString('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    return `<ul class="redes-lista">${['youtube', 'instagram', 'facebook'].map(r => {
      // Con la oración por privado encendida, Instagram lo lleva esa tarjeta (07/10/2026).
      if (r === 'instagram' && p.instagramPorPrivado) return `<li><span class="status approved">OK</span> ${nombres[r]} <small>lo lleva «Oración por mensaje privado» (abajo)</small></li>`;
      const err = e.errores?.[r];
      const activa = (e.redes || []).includes(r);
      const pausa = p.pausas?.[r];
      const permiso = err && /permission|permiso|\(#10\)/i.test(err);
      const txt = !activa ? (r === 'youtube' ? 'apagado (actívalo abajo)' : 'sin conectar')
        : err ? (permiso ? 'falta permiso para leer comentarios' : err) : 'funcionando';
      const extra = pausa && Date.parse(pausa.hasta) > Date.now() ? ` · se vuelve a probar ${esc(hora(pausa.hasta))}` : '';
      return `<li><span class="status ${activa && !err ? 'approved' : 'failed'}">${activa && !err ? 'OK' : 'No'}</span> ${nombres[r]} <small>${esc(txt)}${extra}</small></li>`;
    }).join('')}</ul>`;
  }

  // Oración por mensaje privado (Instagram) y las peticiones de borrado (07/10/2026).
  function privado(p) {
    const fecha = t => esc(new Date(t).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
    const permiso = e => /permission|permiso|capability|\(#(3|10|200)\)/i.test(e || '');
    const error = p.ultimoError && (!p.ultimoEnvio || Date.parse(p.ultimoError.at) > Date.parse(p.ultimoEnvio))
      ? `<p class="panel-help redes-error"><span class="status failed">Falló</span> ${fecha(p.ultimoError.at)}: ${permiso(p.ultimoError.mensaje)
        ? 'Meta no deja enviar privados todavía (falta permiso de mensajes o la app sigue en modo desarrollo).'
        : esc(p.ultimoError.mensaje)}</p>` : '';
    const borrados = (p.borrados || []).length
      ? `<details class="redes-ultimas"><summary>Peticiones de borrado (${p.borrados.length})</summary><ul>${p.borrados.map(b => `<li>
          <span class="eyebrow">${fecha(b.at)}</span> @${esc(b.usuario)} <span>→ ${b.confirmado ? 'borrado y confirmado por privado' : 'borrado (no se pudo confirmar por privado)'}</span></li>`).join('')}</ul></details>`
      : '';
    return `<p class="panel-help">Hoy: <strong>${esc(p.hoy)}</strong> · en total: <strong>${esc(p.total)}</strong> personas${p.ultimoEnvio ? ` · último: ${fecha(p.ultimoEnvio)}` : ' · todavía no ha salido ninguno'}</p>
      <p class="panel-help">Una oración por persona (tope 40 al día), entre 4 y 9 min después de su primer comentario. Instagram solo deja hacerlo en los 7 días siguientes al comentario.</p>
      ${error}
      <p class="panel-help">Quien escribe <strong>BORRAR</strong> o <strong>DELETE</strong> por privado sale de las listas y no vuelve a recibir mensajes${p.noContactar ? ` (${esc(p.noContactar)} hasta ahora)` : ''}.
        ${p.borradoError ? `<span class="status failed">No se pueden leer los privados</span> ${permiso(p.borradoError) ? 'falta permiso de mensajes en Meta.' : esc(p.borradoError)}` : ''}</p>
      ${borrados}`;
  }

  function tarjeta(p) {
    // Solo las piezas que publican algo tienen «último» (las de comentarios y privados, no).
    const ultimo = !('ultimo' in p) ? '' : p.ultimo
      ? `<p class="panel-help">Último: <strong>${esc(p.ultimo.fecha)}</strong>${p.ultimo.tema ? ` · ${esc(p.ultimo.tema)}` : ''}</p>
         <ul class="redes-lista">${Object.entries(p.ultimo.redes || {}).map(([n, r]) => chipRed(n, r)).join('')}</ul>`
      : '<p class="panel-help">Todavía no ha salido.</p>';
    const extra = p.id === 'historia'
      ? `<div class="form-actions wrap"><a class="button primary small" href="/historia" target="_blank" rel="noopener">Abrir historia de hoy</a>
          <button type="button" class="button secondary small" data-copiar="https://panel.tu-dominio.com/hoy">Copiar enlace /hoy</button></div>`
      : p.id === 'amen'
        ? `<p class="panel-help">Respuestas hoy: <strong>${esc(p.hoy)}</strong>${p.proxima ? ` · próxima vuelta: ${esc(new Date(p.proxima).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }))}` : ''}</p>
           <p class="panel-help">Solo contesta «Amén» y «Amén + nombre» (por ejemplo «Amén por mi hija Ana»). El resto lo ves en <a href="#engagement">Comentarios</a>.</p>
           ${estadoAmen(p)}
           ${(p.ultimas || []).length ? `<details class="redes-ultimas" open><summary>Últimas respuestas</summary><ul>${p.ultimas.map(u => `<li>
             <span class="eyebrow">${esc(u.red)} · ${esc(new Date(u.at).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span>
             <q>${esc(u.comentario)}</q><span>→ ${esc(u.respuesta)}</span>${u.url ? ` <a href="${esc(u.url)}" target="_blank" rel="noopener">ver</a>` : ''}</li>`).join('')}</ul></details>` : ''}`
        : p.id === 'privado' ? privado(p) : '';
    return `<article class="panel redes-pieza" data-pieza="${esc(p.id)}">
      <div class="panel-heading"><div><p class="eyebrow">${esc(p.donde)}</p><h2>${esc(p.nombre)}</h2></div>
        <label class="redes-switch"><input type="checkbox" data-encender ${p.encendida ? 'checked' : ''}> <span>${p.encendida ? 'Encendida' : 'Apagada'}</span></label></div>
      ${p.hora !== undefined ? `<div class="form-actions wrap"><label>Hora (Nueva York) <input type="time" data-hora value="${esc(p.hora)}"></label>
        <button type="button" class="button secondary small" data-guardar-hora>Guardar hora</button></div>` : ''}
      ${ultimo}${extra}</article>`;
  }

  function render() {
    const caja = $('#redes-lista');
    if (!caja || !redes.piezas) return;
    caja.innerHTML = redes.piezas.map(tarjeta).join('');
  }

  /* ── Textos y enlaces editables (utils/textos-canal.js) ── */
  function renderTextos() {
    const caja = $('#redes-textos');
    if (!caja || !redes.textos) return;
    const grupos = [...new Set(redes.textos.map(t => t.grupo))];
    caja.innerHTML = grupos.map(g => {
      const items = redes.textos.filter(t => t.grupo === g);
      return `<details class="panel redes-textos-grupo"${g === 'instagram' ? ' open' : ''}><summary><h2>${esc(items[0].grupoNombre)}</h2></summary>
        ${items.map(t => {
          const v = t.lista ? (t.valor || []).join('\n') : t.valor;
          const filas = t.corto ? 1 : Math.min(10, Math.max(3, String(v).split('\n').length + 1));
          return `<div class="redes-texto" data-texto="${esc(t.clave)}" data-lista="${t.lista ? 1 : 0}">
            <label><span>${esc(t.etiqueta)}${t.cambiado ? ' <small class="status approved">Editado</small>' : ''}</span>
            ${t.corto ? `<input type="text" value="${esc(v)}">` : `<textarea rows="${filas}">${esc(v)}</textarea>`}</label>
            <div class="form-actions wrap"><button type="button" class="button primary small" data-guardar-texto>Guardar</button>
            ${t.cambiado ? '<button type="button" class="button ghost small" data-restaurar-texto>Volver al texto original</button>' : ''}</div></div>`;
        }).join('')}</details>`;
    }).join('');
  }

  async function guardaTexto(clave, valor) {
    try {
      await api('/api/textos', { method: 'PUT', body: JSON.stringify({ [clave]: valor }) });
      showToast(valor === null ? 'Texto original restaurado' : 'Texto guardado: se usa desde ya');
      redes.textos = (await api('/api/textos')).textos;
      renderTextos();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  /* ── Conexiones y cifras del libro (05/10/2026) ── */
  let comprobando = false;
  async function cargaConexiones() {
    const caja = $('#redes-conexiones');
    if (!caja || comprobando) return;
    comprobando = true;
    caja.setAttribute('aria-busy', 'true');
    caja.setAttribute('aria-live', 'polite');
    const boton = caja.querySelector('[data-recomprobar]');
    if (boton) { boton.disabled = true; boton.textContent = 'Comprobando…'; }
    else caja.innerHTML = '<p class="panel-help">Comprobando conexiones…</p>';
    try {
      const [conexion, metricas] = await Promise.allSettled([api('/api/conexiones'), api('/api/metricas-web')]);
      const estados = { verified: ['approved', 'Verificado'], partial: ['pending', 'Parcial'], unverified: ['pending', 'Sin verificar'], not_configured: ['', 'Sin conectar'], unavailable: ['failed', 'No disponible'] };
      const conexiones = conexion.status === 'fulfilled' && Array.isArray(conexion.value.conexiones) ? conexion.value.conexiones : null;
      const filas = conexiones ? conexiones.map(c => {
        const [clase, nombre] = estados[c.estado] || ['', 'Sin verificar'];
        const fecha = Date.parse(c.checkedAt);
        const cuando = Number.isFinite(fecha) ? new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(fecha) : null;
        return `<li><span class="status ${clase}">${nombre}</span> <b>${esc(c.titulo)}</b><small class="redes-detalle">${esc(c.detalle)}</small>${cuando ? `<small class="redes-detalle">Comprobado a las ${esc(cuando)}</small>` : ''}</li>`;
      }).join('') : '<li>No se pudieron comprobar las conexiones. Vuelve a intentarlo.</li>';
      const m = metricas.status === 'fulfilled' ? metricas.value : null;
      const n = (o, k) => Number.isFinite(o?.[k]) ? new Intl.NumberFormat('es').format(o[k]) : o && typeof o === 'object' && !Object.hasOwn(o, k) ? '0' : '—';
      caja.innerHTML = `<article class="panel"><div class="panel-heading"><div><p class="eyebrow">CONEXIONES</p><h2>¿Funciona todo?</h2></div>
          <button type="button" class="button secondary small" data-recomprobar>Comprobar otra vez</button></div>
          <ul class="redes-lista">${filas}</ul><p class="panel-help">Cada resultado indica lo que se pudo comprobar. Se reutiliza durante un minuto para evitar consultas repetidas.</p></article>
        <article class="panel"><div class="panel-heading"><div><p class="eyebrow">LIBRO Y ENLACES</p><h2>Quién entra</h2></div></div>
          ${m ? `<dl class="redes-cifras">
            <div><dt>Visitas a la página del libro</dt><dd><b>${n(m.hoy, 'libro_visita')}</b> hoy · ${n(m.semana, 'libro_visita')} en 7 días</dd></div>
            <div><dt>Clics en «Comprar»</dt><dd><b>${n(m.hoy, 'libro_comprar')}</b> hoy · ${n(m.semana, 'libro_comprar')} en 7 días</dd></div>
            <div><dt>Enlace /hoy (historia y bio)</dt><dd><b>${n(m.hoy, 'hoy')}</b> hoy · ${n(m.semana, 'hoy')} en 7 días</dd></div>
          </dl><p class="panel-help">Las ventas reales las ves en Hotmart. Aquí no cuentan los robots ni las vistas previas de WhatsApp.</p>` : '<p class="panel-help">Las métricas no están disponibles. Puedes volver a comprobarlas con el botón de conexiones.</p>'}</article>`;
    } finally {
      comprobando = false;
      caja.setAttribute('aria-busy', 'false');
    }
  }

  async function load() {
    cargaConexiones();
    try {
      redes.piezas = (await api('/api/redes')).piezas;
      render();
      redes.textos = (await api('/api/textos')).textos;
      renderTextos();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function cambia(id, cambios) {
    try {
      await api(`/api/redes/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(cambios) });
      showToast('Guardado');
      await load();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  document.addEventListener('change', e => {
    const caja = e.target.closest('.redes-pieza');
    if (caja && e.target.matches('[data-encender]')) cambia(caja.dataset.pieza, { encendida: e.target.checked });
  });
  document.addEventListener('click', e => {
    const caja = e.target.closest('.redes-pieza');
    if (caja && e.target.matches('[data-guardar-hora]')) cambia(caja.dataset.pieza, { hora: caja.querySelector('[data-hora]').value });
    const bloque = e.target.closest('.redes-texto');
    if (bloque && e.target.matches('[data-guardar-texto]')) {
      const campo = bloque.querySelector('textarea, input');
      guardaTexto(bloque.dataset.texto, campo.value);
    }
    if (bloque && e.target.matches('[data-restaurar-texto]')) guardaTexto(bloque.dataset.texto, null);
    if (e.target.matches('[data-recomprobar]')) cargaConexiones();
    const copiar = e.target.closest('[data-copiar]');
    if (copiar) navigator.clipboard.writeText(copiar.dataset.copiar).then(() => showToast('Enlace copiado'));
  });

  // Resumen en «Hoy»: una línea por pieza con su estado de hoy (05/10/2026).
  async function resumen() {
    const caja = $('#redes-resumen');
    if (!caja) return;
    try {
      const piezas = (await api('/api/redes')).piezas;
      const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
      const chip = p => {
        if (!p.encendida) return '<span class="status">Apagada</span>';
        if (p.id === 'amen') return `<span class="status approved">${esc(p.hoy)} hoy</span>`;
        if (p.id === 'privado') return p.ultimoError && (!p.ultimoEnvio || Date.parse(p.ultimoError.at) > Date.parse(p.ultimoEnvio))
          ? '<span class="status failed">Falló</span>' : `<span class="status approved">${esc(p.hoy)} hoy</span>`;
        if (!p.ultimo || p.ultimo.fecha !== hoy) return `<span class="status">${p.hora ? `a las ${esc(p.hora)}` : 'pendiente'}</span>`;
        const fallo = Object.values(p.ultimo.redes || {}).some(r => r?.status === 'failed');
        return fallo ? '<span class="status failed">Falló</span>' : '<span class="status approved">Publicado</span>';
      };
      caja.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">REDES HOY</p><h2>Instagram y Facebook</h2></div><a class="text-button" href="#redes">Ver todo →</a></div>
        <ul class="redes-resumen__lista">${piezas.map(p => `<li><span>${esc(p.nombre)}</span>${chip(p)}</li>`).join('')}</ul>`;
      caja.hidden = false;
    } catch (_e) { caja.hidden = true; }
  }

  window.renderRedes = load;
  window.renderRedesResumen = resumen;
})();
