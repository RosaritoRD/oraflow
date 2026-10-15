// Despliegue automático de Oraflow (01/10/2026). Decisión pura; la ejecuta
// scripts/autodeploy/run.mjs (timer de systemd oraflow-autodeploy.timer).
//
// A diferencia de keizac-web no se trae nada de GitHub: el remoto de este repo
// es el del autor original. Se despliega cada commit LOCAL nuevo que aún no
// está en el aire.

const DISCO_MINIMO_GB = 4; // una imagen nueva ocupaba ~1 GB y el 01/10 llenó el disco
const ESPERA_CAMBIOS_LOCALES = 30 * 60 * 1000;

function decide({ head, desplegado, dirty, trabajosActivos, discoLibreGB }) {
  if (!desplegado) return { accion: 'adoptar' };
  if (head === desplegado) return { accion: 'nada' };
  // La imagen se construye copiando el directorio: con cambios sin commitear
  // se publicaría trabajo a medias.
  if (dirty) return { accion: 'saltar', motivo: 'cambios-locales' };
  // Reiniciar el contenedor corta el render en curso; se espera a la vuelta siguiente.
  if (trabajosActivos > 0) return { accion: 'esperar', motivo: 'trabajando' };
  if (discoLibreGB < DISCO_MINIMO_GB) return { accion: 'saltar', motivo: 'poco-disco' };
  return { accion: 'desplegar' };
}

// test.js arrastra fallos viejos que no dependen del código (ffmpeg-static
// ausente en el host, credenciales): solo bloquea lo que falle DE NUEVO.
function fallosNuevos(fallidos, conocidos) {
  const ya = new Set(conocidos);
  return fallidos.filter(f => !ya.has(f));
}

function debeAvisar(estado, problema, ahora) {
  if (!problema) return false;
  const mismo = estado && estado.ultimo === problema;
  if (mismo && estado.avisado) return false;
  if (problema.startsWith('cambios-locales@')) {
    const desde = mismo ? estado.desde : ahora;
    return ahora - desde >= ESPERA_CAMBIOS_LOCALES;
  }
  return true;
}

module.exports = { decide, fallosNuevos, debeAvisar, DISCO_MINIMO_GB };
