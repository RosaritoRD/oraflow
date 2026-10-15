/**
 * Política de privacidad y eliminación de datos (05/10/2026). Meta las exige
 * para pasar la app "Oraciones Publisher" a modo en vivo (si no, la API no ve
 * los comentarios del público). Públicas en tu-dominio.com.
 */
const ESTILO = `<style>body{margin:0;background:#fbf6ee;color:#2b2520;font:17px/1.6 Georgia,serif}main{max-width:720px;margin:0 auto;padding:32px 20px 60px}
h1{font-size:32px;line-height:1.15}h2{font-size:21px;margin-top:28px}a{color:#8a5a20}</style>`;
// Contacto por mensaje privado: no se publica ningún correo personal.
const CONTACTO = 'https://ig.me/m/tu_cuenta';

function pagina(titulo, cuerpo) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo} · Oraciones en Presencia de Yeshua</title>${ESTILO}</head><body><main>${cuerpo}
<p style="margin-top:40px;font-size:14px;color:#6d6156">Oraciones en Presencia de Yeshua · Última actualización: 5 de octubre de 2026</p></main></body></html>`;
}

const privacidad = () => pagina('Política de privacidad', `<h1>Política de privacidad</h1>
<p>Oraciones en Presencia de Yeshua (@tu_cuenta) publica oraciones cristianas en YouTube, Instagram y Facebook. Esta política explica qué datos usamos cuando interactúas con nuestras cuentas.</p>
<h2>Qué datos usamos</h2><p>Cuando comentas en nuestras publicaciones, recibimos a través de Meta y de YouTube tu nombre de usuario, el texto del comentario y su fecha. No recibimos tu correo, tu teléfono ni tu ubicación.</p>
<h2>Para qué</h2><p>Solo para responder a tu comentario y, si comentas en Instagram, enviarte una oración por mensaje privado como respuesta a ese comentario. Te enviamos un único mensaje por persona.</p>
<h2>Cuánto tiempo los guardamos</h2><p>Guardamos solo tu nombre de usuario y el identificador del comentario, para no responderte dos veces. Puedes pedir que lo borremos en cualquier momento.</p>
<h2>Con quién los compartimos</h2><p>Con nadie. No vendemos ni cedemos datos. Las compras del devocional las gestiona Hotmart con su propia política de privacidad.</p>
<h2>Tus derechos</h2><p>Puedes pedir ver o borrar tus datos enviándonos un <a href="${CONTACTO}">mensaje privado a @tu_cuenta</a> o siguiendo <a href="/eliminar-datos">estas instrucciones</a>.</p>`);

const eliminar = () => pagina('Eliminación de datos', `<h1>Cómo eliminar tus datos</h1>
<p>Si quieres que borremos lo que guardamos de ti (tu nombre de usuario de Instagram o YouTube y el identificador de tus comentarios):</p>
<ol><li>Envíanos un <a href="${CONTACTO}">mensaje privado a @tu_cuenta</a> con el texto «Eliminar mis datos».</li>
<li>Indica tu nombre de usuario de Instagram o de YouTube.</li>
<li>Los borramos en un máximo de 7 días y te lo confirmamos por mensaje.</li></ol>
<p>También puedes borrar tus comentarios directamente en Instagram, Facebook o YouTube, y quitar el acceso de la app desde la configuración de tu cuenta de Meta.</p>`);

module.exports = { privacidad, eliminar };
