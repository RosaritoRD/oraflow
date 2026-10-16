/* global ui, escapeHTML, switchView, i18n */
// Guides: documentation inside the panel. Our own fixed content (it doesn't come
// from users or the API), which is why it's drawn as HTML. The Spanish versions
// live here; the English ones in guides-en.js (same slugs).
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);

  const GUIAS_ES = [
    {
      slug: 'empezar',
      title: 'Primeros pasos',
      summary: 'Qué hace cada pestaña y el camino de una idea a un video publicado.',
      keywords: 'inicio empezar tour recorrido overview resumen',
      body: `
        <p class="lead">Oraflow produce videos para tu canal con varios agentes de IA: investiga, escribe el guion, pone voz e imágenes, monta el video y lo prepara para publicar. Tú revisas y apruebas.</p>
        <h3>El recorrido de un video</h3>
        <ol class="steps">
          <li><strong>Idea.</strong> Sale de <em>Investigación</em>, del <em>Calendario e ideas</em> o del botón <em>Crear video</em>.</li>
          <li><strong>Producción.</strong> Los agentes hacen guion, voz, escenas, montaje, título y miniatura. Lo ves avanzar en <em>Resumen → Trabajos</em>.</li>
          <li><strong>Revisión.</strong> El video queda en <em>Producción</em> como «Necesita revisión». Ábrelo, mira el video, el guion y la miniatura.</li>
          <li><strong>Aprobación y publicación.</strong> Al aprobarlo se programa. Para subir solo a YouTube hace falta el canal conectado (<a href="#" data-guide-link="cuentas">Cuentas y claves</a>).</li>
        </ol>
        <h3>Las pestañas</h3>
        <p>El menú negro de la izquierda las agrupa como en el panel de Keizac: <strong>Hoy</strong>, <strong>YouTube</strong> (vídeos, Shorts, calendario, investigación y piloto automático), <strong>Redes</strong> (Instagram, Facebook y comentarios), <strong>Resultados</strong>, <strong>Sistema</strong> y <strong>Ayuda</strong>. Pasa el ratón por cada una y se abren sus opciones al lado. En el móvil, el botón ☰ de arriba.</p>
        <p>Arriba a la derecha está <strong>tu perfil</strong> (tus iniciales): ahí eliges tema claro u oscuro, idioma, la pantalla que se abre al entrar y la vista compacta. Cada persona del equipo tiene las suyas. <a href="#" data-guide-link="perfil">Más</a>.</p>
        <dl class="guide-defs">
          <dt>Resumen</dt><dd>Lo que necesita tu atención hoy y los trabajos en marcha.</dd>
          <dt>Investigación</dt><dd>Nichos, ideas y señales de YouTube antes de producir.</dd>
          <dt>Shorts</dt><dd>Shorts de versículos en serie. <a href="#" data-guide-link="shorts">Guía</a>.</dd>
          <dt>Clipping</dt><dd>Clips verticales con subtítulos para campañas. <a href="#" data-guide-link="clipping">Guía</a>.</dd>
          <dt>Operador autónomo</dt><dd>Le das la estrategia del canal y planifica y produce solo.</dd>
          <dt>Producción</dt><dd>Todos los videos, con buscador y filtros por estado.</dd>
          <dt>Calendario e ideas</dt><dd>Lo programado y la lista de ideas pendientes.</dd>
          <dt>Analítica / Interacción</dt><dd>Resultados del canal y comentarios de la audiencia.</dd>
          <dt>Preparación de producción</dt><dd>Comprueba que todo el camino funciona antes de dejarlo en automático.</dd>
          <dt>Cuentas</dt><dd>Qué servicios están conectados y si funcionan.</dd>
          <dt>Configuración del canal</dt><dd>Voz, tono y reglas que siguen todos los agentes.</dd>
        </dl>
        <p class="tip">Atajo: pulsa <kbd>Ctrl</kbd> <kbd>K</kbd> (o <kbd>/</kbd>) para buscar cualquier cosa. <a href="#" data-guide-link="buscador">Más atajos</a>.</p>`
    },
    {
      slug: 'redes',
      title: 'Instagram y Facebook en automático',
      summary: 'Qué sale solo cada día, a qué hora, y cómo encender, apagar o mover cada pieza.',
      keywords: 'redes instagram facebook reel carrusel fecha frase historia horario publicar',
      body: `
        <p class="lead">En <em>Redes</em> ves cada pieza que se publica sola, con su hora y lo último que salió (con enlace para verlo). Si algo falló, sale en rojo con el motivo.</p>
        <h3>Lo que sale cada día (hora de Nueva York)</h3>
        <dl class="guide-defs">
          <dt>07:00 · Oración de la mañana con fecha</dt><dd>Imagen con «Lunes 5 de Octubre». Es lo que más se comparte en el nicho (el «buenos días» que se reenvía).</dd>
          <dt>09:00 · Oración del día</dt><dd>Reel corto con música que invita a comentar «Amén».</dd>
          <dt>12:00 · Carrusel</dt><dd>4 oraciones con su versículo; en Facebook sale como Reel con música.</dd>
          <dt>20:00 · Frase para compartir</dt><dd>Fondo blanco, frase sobre Jesús Rey de reyes y el versículo real.</dd>
          <dt>Historia</dt><dd>Cuando sale el vídeo largo de YouTube: en Facebook se publica sola; la de Instagram la subes tú (ver <a href="#" data-guide-link="historia">Historia con enlace</a>).</dd>
        </dl>
        <h3>Cambiar algo</h3>
        <p>Cada tarjeta tiene su interruptor <em>Encendida</em> y su <em>Hora</em>. Lo que cambies vale desde la siguiente vuelta (cada 15 min).</p>
        <p class="tip">Todas las oraciones terminan en «Amén» y exaltan a Jesús de Nazaret como Rey de reyes. Si la IA lo olvida, el sistema lo añade.</p>`
    },
    {
      slug: 'textos',
      title: 'Textos y enlaces del canal',
      summary: 'Editar el comentario fijo, el mensaje privado, las respuestas «Amén», el libro, el cupón y el pie de YouTube.',
      keywords: 'textos editar comentario fijo mensaje privado dm cupon libro pie descripcion youtube amen respuestas',
      body: `
        <p class="lead">Todo lo que el canal escribe solo se edita en <em>Redes → Textos y enlaces</em>. Guardas y se usa desde la siguiente publicación o respuesta; <em>Volver al texto original</em> deshace tus cambios.</p>
        <h3>Qué se puede cambiar</h3>
        <dl class="guide-defs">
          <dt>Comentario fijo</dt><dd>Uno para carruseles e imágenes, otro para Reels y otro para la oración con fecha. El sistema lo escribe en cada publicación nueva; tú solo tocas la chincheta 📌 (Instagram no deja fijarlo por API).</dd>
          <dt>Mensaje privado</dt><dd>Saludo, párrafo del libro y despedida. La oración del medio sale de una lista de 40 distintas. En el párrafo del libro, <code>{cupon}</code> y <code>{libro}</code> se rellenan solos.</dd>
          <dt>Aviso en el comentario</dt><dd>Lo que se contesta en público cuando se envía la oración por privado. Una opción por línea: se van alternando.</dd>
          <dt>Respuestas «Amén»</dt><dd>Una por línea. <code>{n}</code> pone «, Nombre» si se conoce; en «Amén + nombre», <code>{q}</code> es por quién se ora.</dd>
          <dt>Libro y cupón</dt><dd>El código de Hotmart, la página de venta y la línea del libro en los textos de las publicaciones (déjala vacía para quitarla).</dd>
          <dt>Pie de YouTube</dt><dd>Vacío = el de siempre. Si lo cambias, empieza con la raya <code>━━━━━━━━━━━━━━━</code> y pon cada enlace solo en su línea: así YouTube lo muestra con su icono.</dd>
        </dl>
        <p class="warn">Sin 🕊️ en los comentarios, y siempre Jesús de Nazaret como Rey de reyes.</p>`
    },
    {
      slug: 'comentarios',
      title: 'Comentarios, «Amén» y mensajes privados',
      summary: 'Qué se contesta solo en YouTube, Instagram y Facebook, cuándo y qué te queda a ti.',
      keywords: 'comentarios amen respuesta automatica privado dm instagram youtube facebook oracion',
      body: `
        <p class="lead">El canal contesta solo lo repetitivo para que tú atiendas lo importante.</p>
        <h3>YouTube y Facebook</h3>
        <p>Cada 30-90 minutos (al azar, para que no parezca un robot) se responden los comentarios que son solo «Amén» o «Amén + nombre» («Amén por mi hija Ana» → «Hoy oramos por tu hija Ana…»). Las peticiones de salud, preguntas o historias las dejas tú, en <em>Interacción</em>.</p>
        <h3>Instagram</h3>
        <p>A los 4-9 minutos de <strong>cualquier</strong> comentario, la persona recibe por mensaje privado una oración (40 distintas) con el libro y el cupón, y en su comentario aparece «Te envié una oración por mensaje privado 💌». Una vez por persona; si vuelve a escribir «Amén», se le contesta normal.</p>
        <p class="warn">Para que Instagram y Facebook vean los comentarios del público, la app de Meta «Oraciones Publisher» tiene que estar <strong>en modo en vivo</strong> (en modo desarrollo solo ve los de sus administradores). Política de privacidad: <code>your-domain.com/privacidad</code>; eliminación de datos: <code>/eliminar-datos</code>.</p>
        <p>En <em>Redes → Respuestas automáticas</em> ves cuántas van hoy, la próxima vuelta, el estado de cada red y las últimas respuestas con su enlace.</p>`
    },
    {
      slug: 'mensajes',
      title: 'Mensajes: conectar apps y automatizar',
      summary: 'Conectar Instagram, Facebook, WhatsApp, Telegram y YouTube, crear un mensaje por vídeo y ver qué salió.',
      keywords: 'mensajes bandeja inbox automatizaciones reglas ejecuciones cuentas conectar whatsapp telegram instagram facebook youtube tiktok meta en vivo app review',
      body: `
        <p class="lead">Todas tus conversaciones y respuestas automáticas en un solo lugar: menú <strong>Mensajes</strong>.</p>
        <dl class="guide-defs">
          <dt>Resumen</dt><dd>Cada cuenta conectada, si tiene error, sus reglas activas y lo que salió hoy.</dd>
          <dt>Bandeja</dt><dd>Los privados de Instagram, Facebook, WhatsApp y Telegram juntos. Contestas desde ahí (Meta solo deja contestar en las 24 h siguientes al último mensaje de la persona).</dd>
          <dt>Automatizaciones</dt><dd>Las reglas: «en este vídeo, quien comente <em>libro</em> recibe este privado y esta respuesta».</dd>
          <dt>Ejecuciones</dt><dd>Cada comentario o mensaje atendido: a quién, qué escribió, si salió y, si no, por qué.</dd>
          <dt>Cuentas</dt><dd>Conectar y quitar apps. Puedes tener varias de cada una.</dd>
        </dl>
        <h3>1. Conectar una app</h3>
        <ol class="steps">
          <li><em>Mensajes → Cuentas → Conectar cuenta</em>.</li>
          <li>Elige la app. Se abren sus <strong>instrucciones paso a paso</strong> (dónde sacar el token y qué permisos marcar).</li>
          <li>Pega los datos y pulsa <strong>Comprobar y conectar</strong>: se prueba con la app de verdad antes de guardar. El token queda cifrado y no se vuelve a mostrar.</li>
        </ol>
        <p><strong>Telegram</strong> funciona al momento. <strong>YouTube</strong> usa el canal que ya publica (sin token). <strong>Instagram, Facebook y WhatsApp</strong> dependen de que la app de Meta esté en vivo (punto 4). <strong>TikTok y X</strong> aún no: sus APIs piden aprobación o son de pago; el catálogo explica por qué.</p>
        <h3>2. Crear un mensaje automático para un vídeo</h3>
        <ol class="steps">
          <li><em>Automatizaciones → Nueva regla</em>. Elige la cuenta y el vídeo (o «Todas las publicaciones»).</li>
          <li>Escribe las palabras que la activan (<code>libro, oración</code>). Vacío = cualquier comentario. Da igual mayúsculas y tildes, pero tiene que ser la palabra entera.</li>
          <li>Escribe el mensaje privado (<code>{usuario}</code> pone el @ de la persona) y 3 o más respuestas públicas, una por línea: se van turnando para que Meta no lo tome por spam.</li>
          <li>Guarda. Se revisa cada 5 minutos y contesta a los 4-9 minutos del comentario.</li>
        </ol>
        <p>Qué admite cada app: <strong>Instagram y Facebook</strong> privado + respuesta pública. <strong>YouTube</strong> solo respuesta pública (no tiene privados; tope 30 al día por la cuota). <strong>WhatsApp y Telegram</strong> respuesta automática al mensaje que te escriben.</p>
        <p>La regla de un vídeo manda sobre la general. Lo que atiende una regla ya no lo toca la oración por privado ni el «Amén» automático de <em>Redes</em>: nadie recibe dos mensajes. «Una vez por persona» viene marcado; quien escribió BORRAR no recibe nada.</p>
        <h3>3. Ver qué pasó</h3>
        <p><em>Ejecuciones</em> filtra por cuenta y estado. <strong>Omitido</strong> = ya lo había recibido o pidió no recibir mensajes. <strong>Falló</strong> = en comentarios se reintenta solo hasta 3 veces (los mensajes de chat no se reintentan: contéstalos desde la Bandeja); si es por permisos, la cuenta descansa 1 hora.</p>
        <h3>4. Pasar la app de Meta a «En vivo» (lo que hoy bloquea Instagram y Facebook)</h3>
        <ol class="steps">
          <li><a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com → Mis apps</a> → «Oraciones Publisher» → <em>Configuración de la app → Básica</em>: rellena la URL de la política de privacidad (<code>https://your-domain.com/privacidad</code>), la de eliminación de datos (<code>/eliminar-datos</code>), el icono, la categoría y el correo de contacto. Guarda.</li>
          <li><em>Revisión de la app → Permisos y funciones</em>: pide <strong>acceso avanzado</strong> para <code>instagram_business_manage_comments</code>, <code>instagram_business_manage_messages</code>, <code>pages_read_user_content</code>, <code>pages_manage_engagement</code> y <code>pages_messaging</code>.</li>
          <li>Por cada permiso, Meta pide explicar para qué es y un vídeo corto de pantalla enseñando el uso (por ejemplo: un comentario en un Reel → llega la oración por privado). Puede pedir también la verificación del negocio.</li>
          <li>Cuando lo aprueben (suele tardar días), arriba en la app cambia el interruptor <strong>Modo de la app</strong> de «Desarrollo» a «En vivo».</li>
          <li>Vuelve a <em>Mensajes → Resumen</em>: el error de permisos desaparece en la siguiente vuelta (como mucho 1 hora).</li>
        </ol>
        <p class="warn">WhatsApp necesita además que la dirección <code>/webhooks/whatsapp/</code> sea pública en el servidor para que Meta entregue los mensajes. Es un cambio de configuración del servidor; pídelo cuando vayas a usar WhatsApp.</p>`
    },
    {
      slug: 'historia',
      title: 'Historia de Instagram con enlace',
      summary: 'Subir en 30 segundos la historia del vídeo del día con el enlace escondido.',
      keywords: 'historia story instagram enlace sticker hoy',
      body: `
        <ol class="steps">
          <li>Abre <a href="/historia" target="_blank" rel="noopener">/historia</a> en el teléfono (guárdala en la pantalla de inicio).</li>
          <li>Toca <em>Copiar enlace y abrir Instagram</em> → Instagram → Historia.</li>
          <li>Sticker 🔗 Enlace → pegar. El enlace <code>panel.your-domain.com/hoy</code> siempre abre el vídeo del día.</li>
          <li>Escóndelo detrás de «VER ORACIÓN COMPLETA», pon tu manito y compártela.</li>
        </ol>
        <p class="tip">La API de Instagram no permite stickers: por eso esta parte es a mano. En Facebook la historia sale sola.</p>`
    },
    {
      slug: 'libro',
      title: 'El libro «30 días de paz»',
      summary: 'Dónde se vende, la página de venta, el cupón y dónde aparece.',
      keywords: 'libro ebook hotmart venta cupon devocional pdf',
      body: `
        <dl class="guide-defs">
          <dt>Página de venta</dt><dd><a href="https://your-domain.com/libro" target="_blank" rel="noopener">your-domain.com/libro</a> (botón al pago de Hotmart).</dd>
          <dt>Cupón</dt><dd>YOUR_COUPON, 10 % (se cambia en <em>Textos y enlaces</em> y en Hotmart → Cupones).</dd>
          <dt>Dónde aparece</dt><dd>Pie de todas las descripciones de YouTube, textos de Instagram y Facebook, mensaje privado de Instagram.</dd>
          <dt>Regenerar el PDF</dt><dd><code>node scripts/ebook.js</code> (lleva el nombre del autor dentro, como pide Hotmart).</dd>
        </dl>`
    },
    {
      slug: 'perfil',
      title: 'Tu perfil y tus preferencias',
      summary: 'Tema, idioma, pantalla al entrar y vista compacta para cada persona.',
      keywords: 'perfil preferencias tema claro oscuro idioma inicio compacto cerrar sesion',
      body: `
        <p>Toca tus iniciales arriba a la derecha. Lo que elijas se guarda para <strong>tu</strong> cuenta de Google (cada persona del equipo tiene lo suyo) y se recuerda en este navegador.</p>
        <dl class="guide-defs">
          <dt>Tema</dt><dd>Oscuro, claro o «como el teléfono». La columna del menú sigue negra, como en KEIZAC TECH.</dd>
          <dt>Idioma del panel</dt><dd>Español o inglés.</dd>
          <dt>Pantalla al entrar</dt><dd>Por ejemplo <em>Redes</em> si es lo que más miras.</dd>
          <dt>Vista compacta</dt><dd>Menos espacio entre bloques para ver más en el teléfono.</dd>
        </dl>`
    },
    {
      slug: 'shorts',
      title: 'Shorts de versículos',
      summary: 'De una lista de citas a shorts verticales con música, listos para subir.',
      keywords: 'versiculos biblia salmos lote fondos musica atribucion reina valera',
      body: `
        <p class="lead">Escribes las citas, pulsas un botón y salen shorts verticales (1080×1920) con el versículo en pantalla, la cita debajo («Salmos capítulo 23, versículo 1») y música.</p>
        <h3>1. Fondos</h3>
        <p>En <em>Shorts → Videos de fondo → Subir</em>. Paisajes, cielo, agua, luz. Pueden ser horizontales: se recortan solos a vertical. Si un short no dice qué fondo usar, se elige uno al azar.</p>
        <p class="warn">Usa solo videos de <strong>Pexels</strong> o <strong>Pixabay</strong> (licencia libre) o tuyos. Nada de Google Imágenes ni de otros canales.</p>
        <h3>2. Música</h3>
        <p>Descarga pistas de la <strong>Biblioteca de audio de YouTube</strong> (YouTube Studio → Biblioteca de audio) y súbelas en <em>Música</em>. Si la pista dice «Se requiere atribución», pega ese texto en la casilla de debajo: saldrá en la descripción de cada short.</p>
        <h3>3. El lote</h3>
        <p>Un short por bloque; los bloques se separan con una línea <code>---</code>.</p>
        <pre class="guide-code">Salmos 3:4
---
nombre: confianza
Proverbios 3:5-6
Filipenses 4:13
---
Juan 3:16 | Tu propio texto, si no quieres el de la 1909</pre>
        <ul>
          <li><strong>Basta con la cita.</strong> El texto sale solo de la Reina-Valera 1909, que es de dominio público.</li>
          <li><strong>Un rango</strong> (<code>Salmos 23:1-3</code>) sale como una pantalla por versículo.</li>
          <li>También vale escrito con palabras: <code>Juan capítulo 3 versículo 5</code>.</li>
          <li>Opcional, arriba del bloque: <code>clip: playa.mp4</code>, <code>musica: piano.mp3</code>, <code>nombre: mi-short</code>.</li>
          <li>Los botones de ejemplo añaden un bloque al final del lote.</li>
        </ul>
        <p class="warn">En <strong>Job 39 a 41</strong> la Biblia de 1909 numera distinto que las modernas: ahí escribe el texto a mano con <code>|</code>.</p>
        <h3>4. Hacer y descargar</h3>
        <p>Pulsa <em>Hacer todos los shorts</em>. Cada short tarda unos 20 segundos; puedes seguir usando el panel. En <em>Tus shorts</em> tienes cada video con <em>Descargar</em>, <em>Copiar título</em> y <em>Copiar descripción</em> (versículos, versión de la Biblia, atribución y hashtags).</p>
        <h3>5. Subir a YouTube</h3>
        <p>Desde la app de YouTube en el móvil: <em>Crear → Subir video</em>, elige el short descargado, pega el título y la descripción. Al ser vertical y de menos de 3 minutos, YouTube lo trata como Short.</p>
        <p class="tip">Más de 60 segundos se puede, pero retiene peor. Dos o tres versículos por short suele ser lo ideal.</p>`
    },
    {
      slug: 'clipping',
      title: 'Clipping para campañas',
      summary: 'Cortar videos largos en clips verticales con subtítulos y citas bíblicas.',
      keywords: 'clip recortar campaña subtitulos whisper transcripcion predica',
      body: `
        <p class="lead">Las campañas de clipping pagan por cada mil vistas de clips que hagas de su contenido. Aquí subes su video, eliges el tramo y sale un clip vertical con subtítulos al ritmo de la voz.</p>
        <h3>Paso a paso</h3>
        <ol class="steps">
          <li>Descarga el video que te da la campaña y súbelo en <em>Clipping → Subir video</em> (hasta 1 GB).</li>
          <li>Escribe <em>Desde</em> y <em>Hasta</em> (por ejemplo <code>12:30</code> y <code>13:20</code>). Vacíos = el video entero, con un tope de 3 minutos.</li>
          <li>Elige el <em>Encuadre</em>:
            <ul><li><strong>Llenar la pantalla</strong>: recorta los lados. Bien si quien habla está al centro.</li>
            <li><strong>Video entero con fondo difuminado</strong>: no se pierde nada del encuadre. Mejor con varias personas.</li></ul></li>
          <li>Pulsa <em>Hacer clip</em>. Transcribe con Whisper: en este servidor tarda más o menos lo que dura el tramo.</li>
        </ol>
        <h3>Lo que hace solo</h3>
        <ul>
          <li>Conserva el <strong>audio original</strong> (casi todas las campañas lo exigen).</li>
          <li>Pone lo que se dice en pantalla, de 3 en 3 palabras.</li>
          <li>Si alguien cita la Biblia («Juan 3:16», «Salmos capítulo 23, versículo 1») sale arriba el cartel con la cita.</li>
        </ul>
        <p class="warn"><strong>Lee las reglas de cada campaña.</strong> Algunas prohíben añadir música, piden un hashtag o una mención, o tienen duración mínima. Solo recorta videos con permiso.</p>
        <p class="tip">Calidad <em>La mejor</em> transcribe mejor nombres y citas, pero tarda unas 3 veces más.</p>`
    },
    {
      slug: 'revisar',
      title: 'Revisar y aprobar videos',
      summary: 'Qué significa cada estado y qué mirar antes de aprobar.',
      keywords: 'pipeline produccion estados aprobar revisar calidad needs review attention',
      body: `
        <p class="lead">Nada se publica sin pasar por tu revisión. En <em>Producción</em> tienes todos los videos con su estado.</p>
        <h3>Estados</h3>
        <dl class="guide-defs">
          <dt>En producción</dt><dd>Los agentes siguen trabajando. Si un trabajo falla, en <em>Resumen</em> puedes reanudarlo desde la etapa que falló.</dd>
          <dt>Necesita revisión</dt><dd>Terminado y esperando tu decisión.</dd>
          <dt>Necesita atención</dt><dd>Alguna comprobación de calidad no pasó. Ábrelo para ver cuál.</dd>
          <dt>Aprobado / Programado</dt><dd>Listo y con fecha de publicación.</dd>
          <dt>Publicado</dt><dd>Ya está en YouTube.</dd>
        </dl>
        <h3>Antes de aprobar</h3>
        <ul>
          <li>Mira el video entero: voz, imágenes y que el texto en pantalla no tenga errores.</li>
          <li>Lee el título y la descripción: sin datos inventados ni promesas que el video no cumple.</li>
          <li>Comprueba la miniatura y que las fuentes y los derechos de las imágenes estén bien.</li>
          <li>Si una escena falla, puedes reemplazarla y volver a montar sin repetir todo.</li>
        </ul>`
    },
    {
      slug: 'cuentas',
      title: 'Cuentas y claves',
      summary: 'Qué hace cada clave, cómo probarla y cómo conectar tu canal de YouTube.',
      keywords: 'cuentas claves api key oauth youtube conectar canal google cloud openrouter gemini elevenlabs pexels configuracion',
      body: `
        <p class="lead">En <em>Cuentas</em> ves qué está configurado y puedes <strong>probar cada conexión de verdad</strong>. Las claves nunca se muestran: como mucho los 4 últimos caracteres, para saber cuál es.</p>
        <h3>Conectar el canal de YouTube</h3>
        <p>Para publicar hacen falta dos cosas:</p>
        <ol class="steps">
          <li><strong>El cliente OAuth de Google</strong> (identifica a Oraflow ante Google). En <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud → Credenciales</a>: <em>Crear credenciales → ID de cliente de OAuth → Aplicación web</em>. En «URI de redireccionamiento autorizados» pon exactamente la dirección que te muestra <em>Cuentas → Reemplazar cliente OAuth</em>. Pega el ID y el secreto y guarda.</li>
          <li><strong>El permiso del canal.</strong> Pulsa <em>Conectar canal</em>, entra con la cuenta de Google del canal y acepta. Vuelves al panel con el canal conectado.</li>
        </ol>
        <p class="tip">Después pulsa <em>Probar conexión</em>: te dice el nombre exacto del canal conectado. Así sabes a qué canal se va a subir.</p>
        <p class="warn">Si sale <strong>invalid_client</strong>: el ID o el secreto del cliente no son válidos o el cliente se borró. Crea uno nuevo y pégalo. Si sale <strong>invalid_grant</strong>: el permiso caducó; pulsa <em>Conectar canal</em> otra vez.</p>
        <h3>Las demás claves</h3>
        <dl class="guide-defs">
          <dt>YouTube Data API</dt><dd>Solo lectura de datos públicos para Investigación. No sirve para publicar.</dd>
          <dt>OpenRouter</dt><dd>Escribe guiones, títulos y descripciones.</dd>
          <dt>Gemini</dt><dd>Imágenes y clips de video con IA.</dd>
          <dt>ElevenLabs</dt><dd>La voz que narra. La prueba te dice cuántos caracteres llevas este mes.</dd>
          <dt>Pexels</dt><dd>Fotos y videos de stock gratis para las escenas.</dd>
          <dt>API key del panel</dt><dd>Protege los botones que cambian cosas. Recomendado ponerla.</dd>
        </dl>
        <p>Las marcadas «del .env» se cambian en el servidor, en <code>/path/to/oraflow/.env</code>, y luego se reinicia el contenedor (<code>docker compose up -d oraflow</code> dentro de esa carpeta).</p>
        <p class="warn">Si alguna clave se vio en una captura, un chat o un archivo compartido, <strong>rótala</strong>: crea una nueva en el servicio y borra la vieja.</p>`
    },
    {
      slug: 'buscador',
      title: 'Buscador y atajos de teclado',
      summary: 'Encuentra videos, shorts, guías y acciones desde cualquier pantalla.',
      keywords: 'buscar buscador atajos teclado ctrl k comandos',
      body: `
        <p class="lead">El buscador (<kbd>Ctrl</kbd> <kbd>K</kbd>, <kbd>/</kbd> o la lupa de arriba) encuentra pantallas, acciones, tus videos, ideas, shorts ya hechos y estas guías.</p>
        <ul>
          <li>No importan las tildes ni las mayúsculas: «oracion» encuentra «Oración».</li>
          <li>Varias palabras en cualquier orden: «salmo mañana».</li>
          <li>Funciona en español y en inglés: «configuración» o «setup».</li>
        </ul>
        <h3>Atajos</h3>
        <dl class="guide-defs keys">
          <dt><kbd>Ctrl</kbd> <kbd>K</kbd> · <kbd>/</kbd></dt><dd>Abrir el buscador</dd>
          <dt><kbd>N</kbd></dt><dd>Crear video</dd>
          <dt><kbd>G</kbd> luego <kbd>O</kbd></dt><dd>Resumen</dd>
          <dt><kbd>G</kbd> luego <kbd>V</kbd></dt><dd>Shorts de versículos</dd>
          <dt><kbd>G</kbd> luego <kbd>K</kbd></dt><dd>Clipping</dd>
          <dt><kbd>G</kbd> luego <kbd>P</kbd></dt><dd>Producción</dd>
          <dt><kbd>G</kbd> luego <kbd>C</kbd></dt><dd>Calendario</dd>
          <dt><kbd>G</kbd> luego <kbd>A</kbd></dt><dd>Analítica</dd>
          <dt><kbd>G</kbd> luego <kbd>U</kbd></dt><dd>Cuentas</dd>
          <dt><kbd>G</kbd> luego <kbd>H</kbd></dt><dd>Guías</dd>
          <dt><kbd>Ctrl</kbd> <kbd>S</kbd></dt><dd>Guardar el lote de shorts mientras escribes</dd>
        </dl>`
    },
    {
      slug: 'derechos',
      title: 'Reglas para no perder el canal',
      summary: 'Derechos de autor, contenido reutilizado y varios canales.',
      keywords: 'derechos autor copyright strike content id reutilizado monetizacion canales',
      body: `
        <p class="lead">Un canal se puede perder en semanas por derechos de autor. Estas reglas evitan casi todos los problemas.</p>
        <ul>
          <li><strong>Fondos:</strong> Pexels, Pixabay o tuyos. <strong>Música:</strong> Biblioteca de audio de YouTube o con licencia. <strong>Clips:</strong> solo de campañas que te dan permiso o tuyos.</li>
          <li><strong>No resubas videos de otros canales</strong> aunque les pongas música o texto: llega el reclamo de Content ID, luego el strike. Con 3 strikes cierran el canal.</li>
          <li><strong>Contenido reutilizado:</strong> YouTube no monetiza canales que solo juntan material ajeno con poco aporte propio.</li>
          <li><strong>Varios canales:</strong> si uno cae por strikes, YouTube puede cerrar todos los canales relacionados contigo.</li>
          <li><strong>Biblias:</strong> la Reina-Valera 1909 es de dominio público. La RVR1960 y la NVI tienen derechos de autor.</li>
          <li><strong>The Chosen</strong> y otras series: solo si sus dueños lo permiten por escrito.</li>
        </ul>`
    },
    {
      slug: 'problemas',
      title: 'Solución de problemas',
      summary: 'Qué hacer cuando algo no sale.',
      keywords: 'error falla problema no funciona subir lento ayuda',
      body: `
        <dl class="guide-defs">
          <dt>«No disponible» en Shorts o Clipping</dt><dd>La carpeta del proyecto no está montada en el contenedor. Revisa <code>SHORTS_DIR</code> y el volumen <code>/shorts</code> en <code>oraflow-lab/docker-compose.yml</code>.</dd>
          <dt>La subida falla</dt><dd>Topes: fondos 300 MB, música 40 MB, videos de clipping 1 GB. Con archivos grandes, usa wifi y no cierres la pestaña.</dd>
          <dt>El trabajo termina «con errores»</dt><dd>Mira el cuadro <em>Progreso</em>: dice qué short falló y por qué (una cita que no existe, una línea sin texto…). Los demás se hacen igual.</dd>
          <dt>«No encontré … en la Biblia»</dt><dd>Revisa el nombre del libro y los números. Para otro texto usa <code>cita | texto</code>.</dd>
          <dt>El clip tarda mucho</dt><dd>Normal: transcribe en el procesador del servidor. Usa la calidad <em>Rápida</em> o un tramo más corto.</dd>
          <dt>Pide una «API key»</dt><dd>Es la clave <code>API_KEY</code> del <code>.env</code> del servidor. Se guarda solo en este navegador.</dd>
          <dt>YouTube: invalid_client / invalid_grant</dt><dd>Ver <a href="#" data-guide-link="cuentas">Cuentas y claves</a>.</dd>
        </dl>`
    }
  ];

  const GUIAS = i18n.language === 'es' || !window.agentGuidesEn ? GUIAS_ES : window.agentGuidesEn;
  const estado = { slug: GUIAS[0].slug };

  function lista(filtro = '') {
    const core = window.searchCore;
    const items = GUIAS.map(g => ({ ...g, label: g.title, hint: g.summary }));
    const vistas = core ? core.rank(items, filtro) : items;
    $('#docs-list').innerHTML = vistas.length ? vistas.map(g => `
      <button type="button" class="docs-link ${g.slug === estado.slug ? 'active' : ''}" data-guide="${escapeHTML(g.slug)}">
        <strong>${core ? core.highlight(g.title, filtro, escapeHTML) : escapeHTML(g.title)}</strong>
        <span>${escapeHTML(g.summary)}</span>
      </button>`).join('') : `<p class="empty-inline">${escapeHTML(i18n.t('No guide matches.'))}</p>`;
  }

  function abrir(slug) {
    const g = GUIAS.find(x => x.slug === slug) || GUIAS[0];
    estado.slug = g.slug;
    $('#docs-article').innerHTML = `<p class="eyebrow">${escapeHTML(i18n.t('GUIDE'))}</p><h2>${escapeHTML(g.title)}</h2>${g.body}`;
    lista($('#docs-search').value);
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('[data-guide]');
    if (link) { abrir(link.dataset.guide); $('#docs-article').focus({ preventScroll: true }); $('#docs-article').scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const inline = event.target.closest('[data-guide-link]');
    if (inline) { event.preventDefault(); window.openGuide(inline.dataset.guideLink); }
  });
  $('#docs-search').addEventListener('input', event => lista(event.target.value));

  window.agentGuides = GUIAS.map(({ slug, title, summary, keywords }) => ({ slug, title, summary, keywords }));
  window.openGuide = slug => {
    if (ui.currentView !== 'docs') switchView('docs');
    abrir(slug);
  };
  window.renderDocs = () => { if (!$('#docs-article').innerHTML) abrir(estado.slug); };
  abrir(estado.slug);
})();
