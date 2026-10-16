/* Open-source edition: the Messages module isn't included, so its menu entry is
   hidden (railnav.js reads this flag) and its screens explain why if opened directly. */
(() => {
  'use strict';
  window.mensajesDisponibles = false;
  document.addEventListener('DOMContentLoaded', () => {
    for (const id of ['msj-resumen', 'msj-bandeja', 'msj-reglas', 'msj-ejecuciones', 'msj-cuentas']) {
      const view = document.getElementById(`${id}-view`);
      if (view) view.innerHTML = '<div class="empty">The Messages module is not included in the open-source edition.</div>';
    }
  });
})();
