/* Central ES/EN interface catalogue. English source strings are stable keys.
 * Template placeholders are translated before values are interpolated, so titles,
 * narration, prompts and other user/API content never pass through the catalogue.
 */
(() => {
  'use strict';
const entries = `
GROWTH|CRECIMIENTO
Subscriber conversion|Conversión a suscriptores
Long videos|Vídeos largos
Format unavailable|Formato sin identificar
Engaged views|Visualizaciones interesadas
Subscribers gained|Suscriptores ganados
Per 1,000 engaged views|Por cada 1.000 interesadas
Per 1,000 views|Por cada 1.000 vistas
Video / measured period|Vídeo / periodo con datos
Awaiting measurement|Pendiente de medición
@@0@@ measured · @@1@@ pending|@@0@@ medidos · @@1@@ pendientes
Compare videos of the same format and similar measurement periods. Recent days may still be processing.|Compara vídeos del mismo formato y con periodos de medición similares. Los días recientes pueden seguir procesándose.
Skip to content|Saltar al contenido
Your channel, in production.|Tu canal, en producción.
YOUR NEXT STEP|TU SIGUIENTE PASO
Next action|Siguiente acción
Loading your workspace…|Cargando tu espacio de trabajo…
Review, schedule and publish from one place.|Revisa, programa y publica desde un solo lugar.
waiting for a decision →|esperando una decisión →
in your publishing queue →|en tu cola de publicación →
all time →|histórico →
Connect your channel to get started.|Conecta tu canal para empezar.
@@0@@ videos need your attention.|@@0@@ vídeos necesitan tu atención.
@@0@@ videos are scheduled.|@@0@@ vídeos están programados.
Make room for your next idea.|Prepara tu próxima idea.
Review your channel settings before creating a video.|Revisa la configuración del canal antes de crear un vídeo.
Check the video, script and thumbnail before approving.|Comprueba el vídeo, el guion y la miniatura antes de aprobar.
Open the calendar to review upcoming releases.|Abre el calendario para revisar las próximas publicaciones.
Explore your research or turn a saved idea into a video.|Explora tu investigación o convierte una idea guardada en un vídeo.
Review content →|Revisar contenido →
Explore research →|Explorar investigación →
Find a video and pick up where you left off.|Encuentra un vídeo y continúa donde lo dejaste.
Search videos|Buscar vídeos
Search by title or topic|Buscar por título o tema
Filter by status|Filtrar por estado
Review queue|Cola de revisión
In production|En producción
Sort videos|Ordenar vídeos
Newest first|Más recientes
Oldest first|Más antiguos
Title A–Z|Título A–Z
Clear filters|Limpiar filtros
@@0@@ of @@1@@ videos|@@0@@ de @@1@@ vídeos
No videos found. Try another search or clear the filters.|No se encontraron vídeos. Prueba otra búsqueda o limpia los filtros.
Could not refresh. Displayed data may be outdated.|No se pudo actualizar. Los datos mostrados pueden estar desactualizados.
Try again|Reintentar
Updated at @@0@@|Actualizado a las @@0@@
Connection interrupted|Conexión interrumpida

YouTube Automation Studio|Estudio de automatización de YouTube
Automation Studio|Estudio de automatización
Operator console|Consola de operaciones
Workspace|Espacio de trabajo
Overview|Resumen
Research|Investigación
Autonomous operator|Operador autónomo
Pipeline|Producción
Calendar & ideas|Calendario e ideas
Analytics|Analítica
Engagement|Interacción
Production readiness|Preparación de producción
Channel setup|Configuración del canal
Connecting…|Conectando…
Pause automation|Pausar automatización
OPERATOR OVERVIEW|RESUMEN DE OPERACIONES
Know what happens next.|Sabe qué viene después.
Interface language|Idioma de la interfaz
＋ Create video|＋ Crear vídeo
Finish setup to activate your agents|Completa la configuración para activar tus agentes
The operator console is ready, but generation and publishing stay disabled until credentials are configured.|La consola está lista; la generación y la publicación se habilitarán al configurar las credenciales.
Needs review|Pendiente de revisión
waiting for a decision|esperando una decisión
Scheduled|Programado
next 30 days|próximos 30 días
Published|Publicado
all time|histórico
Average score|Puntuación media
recent content performance|rendimiento del contenido reciente
DECISION QUEUE|DECISIONES PENDIENTES
Ready for you|Listo para revisar
View pipeline →|Ver producción →
ACTIVE WORK|TRABAJO EN CURSO
Generation jobs|Tareas de generación
UP NEXT|A CONTINUACIÓN
Publishing calendar|Calendario de publicación
Open calendar →|Abrir calendario →
INBOX|BANDEJA DE ENTRADA
Recent activity|Actividad reciente
RESEARCH INBOX|BANDEJA DE INVESTIGACIÓN
Research before you generate.|Investiga antes de generar.
Validate the niche, preserve the source material, then hand the strongest idea to Oraflow.|Valida el nicho, conserva las fuentes y entrega la mejor idea a Oraflow.
Connecting|Conectando
Refresh research|Actualizar investigación
Validate|Validar
Real channel evidence|Datos reales de canales
Queue|Encolar
Editorial backlog|Ideas editoriales pendientes
Produce|Producir
Oraflow pipeline|Producción de Oraflow
Opportunity radar|Radar de oportunidades
Niche evidence|Evidencia del nicho
Ideas|Ideas
Notes|Notas
Prompts|Prompts
Saved|Guardados
OPEN-SOURCE SIGNAL ENGINE|MOTOR DE SEÑALES DE CÓDIGO ABIERTO
Find demand before supply catches up|Encuentra demanda antes de que llegue la oferta
Scans YouTube demand, competition, outliers, monetization and search momentum.|Analiza la demanda, competencia, resultados destacados, monetización y tendencias de búsqueda en YouTube.
Starting market|Mercado inicial
Audience country|País de la audiencia
United States|Estados Unidos
Mexico|México
Spain|España
United Kingdom|Reino Unido
Canada|Canadá
Content language|Idioma del contenido
English|Inglés
Spanish|Español
Candidate depth|Profundidad del análisis
Quick · 3 opportunities|Rápido · 3 oportunidades
Balanced · 5 opportunities|Equilibrado · 5 oportunidades
Deep · 8 opportunities|Profundo · 8 oportunidades
Each scan spends YouTube Data API quota. “Next 30 days” is a directional signal, not a guaranteed forecast.|Cada análisis consume cuota de YouTube Data API. «Próximos 30 días» es una señal orientativa, no una predicción garantizada.
Scan niche opportunities|Analizar oportunidades de nicho
ENGINE|MOTOR
Research connection|Conexión de investigación
Checking|Comprobando
30-DAY OPPORTUNITY MAP|MAPA DE OPORTUNIDADES A 30 DÍAS
No scan selected|Ningún análisis seleccionado
Start with a broad market. The engine will expand and rank specific niches.|Empieza con un mercado amplio. El motor ampliará y clasificará nichos específicos.
Idle|En espera
Collecting live evidence from YouTube and Google Trends…|Recopilando datos en directo de YouTube y Google Trends…
CHANNEL EVIDENCE|EVIDENCIA DE CANALES
Add one comparable channel|Añade un canal comparable
Niche|Nicho
Channel name|Nombre del canal
Evidence type|Tipo de evidencia
English reference|Referencia en inglés
Spanish competition|Competencia en español
Language|Idioma
Monthly views|Visualizaciones mensuales
Average duration|Duración media
First video published|Primer vídeo publicado
Use current figures from VidIQ or Social Blade. The verdict updates every time you add a channel.|Usa cifras actuales de VidIQ o Social Blade. El veredicto se actualiza al añadir cada canal.
Save channel & validate|Guardar canal y validar
LIVE VERDICT|VEREDICTO EN DIRECTO
Does the evidence hold?|¿La evidencia lo respalda?
NICHE CANDIDATES|NICHOS CANDIDATOS
Find a direction to validate|Encuentra una dirección para validar
Filter by theme|Filtrar por temática
All themes|Todas las temáticas
TITLE HOOKS|GANCHOS PARA TÍTULOS
Shape a production-ready idea|Prepara una idea lista para producir
Video subject|Tema del vídeo
Generate title hooks|Generar ganchos para títulos
SOURCE MATERIAL|MATERIAL DE REFERENCIA
Preserve a transcript or observation|Conserva una transcripción u observación
Notes stay in the existing YouTube research archive.|Las notas se guardan en el archivo de investigación de YouTube existente.
Title|Título
Text|Texto
Save research note|Guardar nota de investigación
PROMPT BUILDER|EDITOR DE PROMPTS
Fill the production brief|Completa el encargo de producción
Template|Plantilla
Copy completed prompt|Copiar prompt completado
READY TO USE|LISTO PARA USAR
Prompt preview|Vista previa del prompt
VALIDATED WORK|TRABAJO VALIDADO
Saved niches|Nichos guardados
ARCHIVE|ARCHIVO
Saved notes|Notas guardadas
Autonomous Channel Operator|Operador autónomo del canal
Set the destination once. Oraflow researches, plans, produces, and manages the channel workflow around it.|Define el objetivo. Oraflow investiga, planifica, produce y gestiona el trabajo del canal para alcanzarlo.
Not configured|Sin configurar
CHANNEL MANDATE|MISIÓN DEL CANAL
What should this channel achieve?|¿Qué debe lograr este canal?
Objective|Objetivo
Audience|Audiencia
Value proposition|Propuesta de valor
Content pillars|Pilares de contenido
Separate 1–8 durable themes with commas.|Separa de 1 a 8 temas duraderos con comas.
Videos per week|Vídeos por semana
Videos per planning run|Vídeos por ciclo de planificación
Default format|Formato predeterminado
Explainer|Explicativo
Tutorial|Tutorial
List|Lista
Review|Revisión
Story|Historia
Default length|Duración predeterminada
Short · 2–4 min|Corto · 2–4 min
Medium · 8–12 min|Medio · 8–12 min
Long · 15–20 min|Largo · 15–20 min
Primary outcome|Resultado principal
Views|Visualizaciones
Watch hours|Horas de visualización
Net subscribers|Suscriptores netos
Engagement rate|Tasa de interacción
Estimated revenue|Ingresos estimados
Target value|Valor objetivo
Target window|Periodo del objetivo
7 days|7 días
28 days|28 días
90 days|90 días
365 days|365 días
Monthly production budget|Presupuesto mensual de producción
Outcome context|Contexto del resultado
Used by planning alongside the measurable primary outcome.|Se utiliza en la planificación junto con el resultado principal medible.
Boundaries and constraints|Límites y restricciones
The operator uses YouTube trend signals, configured competitors, and channel history. Publishing still obeys your quality, factual-review, rights, and approval gates.|El operador usa tendencias de YouTube, competidores configurados y el historial del canal. La publicación respeta tus controles de calidad, verificación, derechos y aprobación.
Save strategy|Guardar estrategia
Activate & run now|Activar y ejecutar ahora
Pause operator|Pausar operador
CURRENT RUN|EJECUCIÓN ACTUAL
Waiting for a strategy|Esperando una estrategia
Resume run|Reanudar ejecución
Stop run|Detener ejecución
EDITORIAL PLAN|PLAN EDITORIAL
What Oraflow decided to make|Lo que Oraflow decidió producir
Content pipeline|Producción de contenido
Every generated video, its real state, and the next available action.|Cada vídeo generado, su estado real y la siguiente acción disponible.
All content|Todo el contenido
Needs attention|Requiere atención
Approved|Aprobado
Calendar & idea backlog|Calendario e ideas pendientes
Shape the queue before generation starts.|Prepara la cola antes de empezar a generar.
＋ Add idea|＋ Añadir idea
SCHEDULED|PROGRAMADO
Upcoming releases|Próximas publicaciones
BACKLOG|PENDIENTES
Content ideas|Ideas de contenido
Performance signals|Señales de rendimiento
Data translated into decisions, not vanity metrics.|Datos que orientan decisiones, más allá de métricas superficiales.
Analyzed videos|Vídeos analizados
last 30 days|últimos 30 días
Performance score|Puntuación de rendimiento
channel average|media del canal
Recommended action|Acción recomendada
Collecting enough data to recommend a move.|Recopilando datos suficientes para recomendar una acción.
OUTCOME & ROI STUDIO|RESULTADOS Y RETORNO DE INVERSIÓN
Is the channel achieving its mandate?|¿El canal está cumpliendo su misión?
Configure a primary outcome in the Autonomous Operator to align channel learning with a measurable goal.|Configura un resultado principal en el operador autónomo para orientar el aprendizaje del canal hacia un objetivo medible.
CHANNEL BASELINE|REFERENCIA DEL CANAL
What real results say|Qué dicen los resultados reales
0 snapshots|0 mediciones
Only real YouTube analytics enter this evidence layer. Simulated fallback data is excluded.|Esta sección solo utiliza analítica real de YouTube. Se excluyen los datos simulados.
WHAT THE AGENT LEARNED|LO QUE APRENDIÓ EL AGENTE
Review recommendations|Revisar recomendaciones
0 approved|0 aprobadas
CONTROLLED GROWTH EXPERIMENTS|EXPERIMENTOS CONTROLADOS DE CRECIMIENTO
Prove the next move|Comprueba el siguiente paso
Run approved title and thumbnail arms against real YouTube evidence, then separately approve the winner.|Prueba variantes aprobadas de títulos y miniaturas con datos reales de YouTube y aprueba por separado la ganadora.
0 running|0 en curso
Published production|Producción publicada
Hours per arm|Horas por variante
24 hours|24 horas
48 hours|48 horas
72 hours|72 horas
Minimum impressions|Impresiones mínimas
Create test plan|Crear plan de prueba
SCENE-AWARE RETENTION|RETENCIÓN POR ESCENA
Where viewers stay—and leave|Dónde se quedan y se van los espectadores
Real YouTube retention points mapped onto the exact production timeline.|Datos reales de retención de YouTube sobre la línea temporal exacta de la producción.
Retention snapshot|Medición de retención
Refresh curve|Actualizar curva
Scene findings remain evidence only. They influence future scripts and pacing only after their recommendation is approved above; published videos are never edited automatically.|Los hallazgos por escena sirven como evidencia. Solo influyen en futuros guiones y ritmos tras aprobar la recomendación; los vídeos publicados nunca se editan automáticamente.
TOP PERFORMERS|MEJORES RESULTADOS
What is working|Qué está funcionando
LOCAL ACTIVATION|ACTIVACIÓN LOCAL
First-run journey|Primeros pasos
Calculated locally from your database and video files. Nothing is transmitted unless anonymous telemetry is explicitly enabled.|Se calcula localmente con tu base de datos y vídeos. No se transmite nada salvo que actives expresamente la telemetría anónima.
AUDIENCE VOICE|VOZ DE LA AUDIENCIA
What commenters are saying|Qué dicen los comentarios
posting locked|publicación bloqueada
Sync now|Sincronizar ahora
REPLY QUEUE|RESPUESTAS PENDIENTES
Approve before anything posts|Aprueba antes de publicar
0 drafts|0 borradores
Draft replies|Preparar respuestas
NEEDS ATTENTION|REQUIERE ATENCIÓN
Likely spam and scams|Posible spam y estafas
0 flagged|0 marcados
AUDIENCE-REQUESTED IDEAS|IDEAS SOLICITADAS POR LA AUDIENCIA
Approve to feed the operator|Aprueba para informar al operador
0 pending|0 pendientes
Verify the real path from providers to a publishable YouTube upload before autonomy spends time or credits.|Verifica el recorrido real desde los proveedores hasta un vídeo publicable antes de que el operador consuma tiempo o créditos.
Unverified|Sin verificar
VERIFIED DRY RUN|PRUEBA VERIFICADA
Prove the pipeline, without uploading.|Verifica la producción sin subir vídeos.
The check makes small live text and narration requests, verifies channel access, builds a local audio/video MP4, and validates queued metadata. It never creates or uploads a YouTube video.|La prueba realiza pequeñas solicitudes reales de texto y narración, verifica el acceso al canal, crea un MP4 local y valida los metadatos pendientes. Nunca crea ni sube un vídeo a YouTube.
No readiness run recorded.|No hay pruebas de preparación registradas.
Include paid image probe|Incluir prueba de imagen de pago
Include paid video probe|Incluir prueba de vídeo de pago
Run verified check|Ejecutar verificación
Live provider probes can consume a small amount of quota or credits.|Las pruebas reales de proveedores pueden consumir una pequeña cantidad de cuota o créditos.
A recorded blocking failure stops autonomous generation and publishing until a later run passes. An unverified or stale result remains visible but does not interrupt manual work.|Un fallo bloqueante detiene la generación y publicación autónomas hasta superar una nueva prueba. Un resultado sin verificar o antiguo sigue visible, pero no interrumpe el trabajo manual.
These guardrails guide every agent in the pipeline.|Estas reglas orientan a todos los agentes de producción.
Channel goal|Objetivo del canal
Target audience|Audiencia objetivo
Brand voice|Voz de la marca
Timezone|Zona horaria
Default call to action|Llamada a la acción predeterminada
Visual direction|Dirección visual
Blocked topics or terms|Temas o términos bloqueados
Quality review blocks content containing these terms.|La revisión de calidad bloquea contenido que incluya estos términos.
Require approval before scheduling|Exigir aprobación antes de programar
Save operator notifications|Guardar notificaciones del operador
Video elements|Elementos del vídeo
Added on top of long videos, burned in with the captions. Start is 0:11, End is 30 seconds before the end.|Se añaden encima de los vídeos largos, junto con los subtítulos. Inicio es el 0:11; Final, 30 segundos antes de terminar.
Like · Subscribe · Bell animation|Animación Me gusta · Suscríbete · Campana
A cursor taps like, subscribe and the bell.|Un cursor pulsa me gusta, suscribirse y la campana.
“Turn on the bell” reminder|Recordatorio «Activa la campana»
A card with a ringing bell.|Una tarjeta con la campana sonando.
Comment invitation|Invitación a comentar
A card with the text below.|Una tarjeta con el texto de abajo.
Comment invitation text|Texto de la invitación a comentar
Also on Shorts (near the end)|También en los Shorts (cerca del final)
“Share this prayer” card|Tarjeta «Comparte esta oración»
Asks the viewer to share it with someone who needs it.|Pide compartirla con alguien que la necesite.
Middle|Mitad
Video provider|Proveedor de vídeo
Local slideshow · no provider cost|Presentación local · sin coste de proveedor
Automatic capability routing|Selección automática por capacidades
Provider credentials are checked at runtime.|Las credenciales del proveedor se comprueban al ejecutar.
Generation mode|Modo de generación
Hybrid · generated clips + local assembly|Híbrido · clips generados y montaje local
Local slideshow only|Solo presentación local
Clip duration|Duración de clip
Paid seconds cap|Límite de segundos de pago
Maximum provider-generated seconds per production.|Máximo de segundos generados por un proveedor por producción.
Save channel setup|Guardar configuración del canal
Set dashboard API key|Configurar clave API del panel
NEW GENERATION JOB|NUEVA TAREA DE GENERACIÓN
Create a video|Crear un vídeo
Topic|Tema
optional—leave blank for agent selection|opcional: en blanco lo elige el agente
Format|Formato
Length|Duración
Generation runs in the background. You can follow each stage and cancel between stages.|La generación se ejecuta en segundo plano. Puedes seguir cada etapa y cancelar entre etapas.
Start generation|Iniciar generación
Cancel|Cancelar
Add a content idea|Añadir una idea de contenido
Angle|Enfoque
Why it is worth making|Por qué merece la pena producirlo
Add to backlog|Añadir a pendientes
YouTube Automation Studio home|Inicio del estudio de automatización de YouTube
Main navigation|Navegación principal
Refresh dashboard|Actualizar panel
Research to production workflow|Flujo de investigación a producción
Research tools|Herramientas de investigación
Prayer and spiritual wellness|Oración y bienestar espiritual
Morning prayers|Oraciones de la mañana
Morning Prayers Daily|Oraciones matutinas diarias
A prayer for strength before work|Una oración para tener fortaleza antes del trabajo
Paste the transcript, research notes, or source material here…|Pega aquí la transcripción, notas de investigación o material de referencia…
Completed prompt preview|Vista previa del prompt completado
Become the most trusted practical channel for small businesses adopting AI.|Ser el canal práctico de mayor confianza para pequeñas empresas que adoptan IA.
Owners and operators at 5–50 person service businesses|Propietarios y responsables de empresas de servicios de 5 a 50 personas
Clear, tested advice viewers can apply this week|Consejos claros y probados que se puedan aplicar esta semana
AI workflows, automation playbooks, tool reviews|Flujos con IA, guías de automatización, análisis de herramientas
Outcome currency|Moneda del resultado
Optional|Opcional
Grow qualified subscribers who return for practical automation tutorials|Aumentar suscriptores interesados que vuelvan por tutoriales prácticos de automatización
No hype, no unverified statistics, explain costs and tradeoffs.|Sin exageraciones ni cifras sin verificar; explica costes y limitaciones.
Choose a retention snapshot|Elige una medición de retención
Choose a synced video|Elige un vídeo sincronizado
Clear, credible, engaging|Claro, creíble, atractivo
term one, term two|primer término, segundo término
How small teams can automate repetitive work|Cómo pueden los equipos pequeños automatizar el trabajo repetitivo
What makes this take distinctive?|¿Qué distingue este enfoque?
`;

  // Runtime and dynamic-view messages are kept alongside static-page messages.
  const dynamicEntries = `
Social|Redes
Instagram and Facebook|Instagram y Facebook
Daily posts|Publicaciones diarias
Today's story|Historia de hoy
Covers to upload|Portadas para subir
Comments|Comentarios
«Amén» replies|Respuestas «Amén»
Settings|Ajustes
Texts and links|Textos y enlaces
Book (sales page)|Libro (página de venta)
Messages|Mensajes
Conversations|Conversaciones
Overview|Resumen
Inbox|Bandeja
Automatic|Automático
Per-video automations|Automatizaciones por vídeo
Runs|Ejecuciones
Connected accounts|Cuentas conectadas
SOCIAL MEDIA|REDES SOCIALES
Instagram and Facebook on autopilot.|Instagram y Facebook en piloto automático.
MESSAGES|MENSAJES
All your accounts in one place.|Todas tus cuentas en un solo lugar.
MESSAGES · INBOX|MENSAJES · BANDEJA
All your conversations together.|Todas tus conversaciones juntas.
MESSAGES · AUTOMATIONS|MENSAJES · AUTOMATIZACIONES
An automatic message for each video.|Un mensaje automático para cada vídeo.
MESSAGES · RUNS|MENSAJES · EJECUCIONES
What went out, to whom and what failed.|Qué salió, a quién y qué falló.
MESSAGES · ACCOUNTS|MENSAJES · CUENTAS
Connect all your accounts.|Conecta todas tus cuentas.
Everything that goes out on its own each day: turn each piece on or off, change its time and see what went out and what failed.|Todo lo que sale solo cada día: enciende o apaga cada pieza, cambia su hora y mira qué salió y qué falló.
What the channel writes on its own: pinned comment, private message, «Amén» replies, book, coupon and YouTube footer. Whatever you save is used from the next post on.|Lo que escribe el canal solo: comentario fijo, mensaje privado, respuestas «Amén», libro, cupón y pie de YouTube. Lo que guardes se usa desde la siguiente publicación.
All your accounts at a glance: what's connected, how many rules are working and what went out today.|Todas tus cuentas en un vistazo: qué está conectado, cuántas reglas trabajan y qué salió hoy.
Private messages from Instagram, Facebook, WhatsApp and Telegram together. Pick a conversation to read it and reply.|Los mensajes privados de Instagram, Facebook, WhatsApp y Telegram juntos. Elige una conversación para leerla y contestar.
Automations|Automatizaciones
A different message for each video: if someone comments a word on that post (Instagram, Facebook or YouTube), they get your private message and a reply on their comment. On WhatsApp and Telegram, automatic replies by keyword.|Un mensaje distinto para cada vídeo: si alguien comenta una palabra en esa publicación (Instagram, Facebook o YouTube), recibe tu mensaje privado y una respuesta en su comentario. En WhatsApp y Telegram, respuestas automáticas por palabra clave.
Every comment a rule handled: to whom, what they wrote, whether the private message and the reply went out, or why not.|Cada comentario que atendió una regla: a quién, qué escribió, si salió el privado y la respuesta, o por qué no.
Accounts|Cuentas
Connect all the apps you want to manage from here: Instagram, Facebook, WhatsApp, Telegram and your YouTube channel. Each one comes with its instructions.|Conecta todas las apps que quieras administrar desde aquí: Instagram, Facebook, WhatsApp, Telegram y tu canal de YouTube. Cada una trae sus instrucciones.
New rule|Nueva regla
No guide matches.|Ninguna guía coincide.
GUIDE|GUÍA
All accounts|Todas
Skipped|Omitido
Connect account|Conectar cuenta
Conversations|Conversaciones
Refresh|Actualizar
Account|Cuenta
Status|Estado
Sent|Enviado
Partial|A medias
Failed|Falló
Profile preferences|Preferencias del perfil
Theme|Tema
Dark|Oscuro
Light|Claro
Like the phone|Como el teléfono
Panel language|Idioma del panel
Start screen|Pantalla al entrar
Compact view (less space between blocks)|Vista compacta (menos espacio entre bloques)
Sign out|Cerrar sesión
Preference saved|Preferencia guardada
Could not save|No se pudo guardar
Today|Hoy
Social (Instagram and Facebook)|Redes (Instagram y Facebook)
Messages (overview)|Mensajes (resumen)
Messages (inbox)|Mensajes (bandeja)
Videos in production|Vídeos en producción
Calendar and ideas|Calendario e ideas
Verse Shorts|Shorts de versículos
Results|Resultados
Research|Investigación
Autopilot|Piloto automático
Channel settings|Ajustes del canal
Production review|Revisión de producción
Guides|Guías
Enter the API_KEY value from your .env. It stays in this browser only.|Introduce el valor de API_KEY del archivo .env. Se guarda solo en este navegador.
Request failed|La solicitud falló
Not scheduled|Sin programar
just now|ahora mismo
@@0@@m ago|hace @@0@@ min
@@0@@h ago|hace @@0@@ h
@@0@@d ago|hace @@0@@ días
Dashboard unavailable|Panel no disponible
Setup required|Configuración pendiente
Automation paused|Automatización pausada
@@0@@ agents online|@@0@@ agentes activos
Resume automation|Reanudar automatización
@@0@@ · stale|@@0@@ · desactualizado
The production path is verified.|El proceso de producción está verificado.
Core checks passed with warnings.|Pruebas principales superadas con avisos.
Automation is blocked until this is fixed.|La automatización está bloqueada hasta corregir el problema.
@@0@@ passed, @@1@@ warning@@2@@, and @@3@@ failed.|@@0@@ correctas, @@1@@ con aviso@@2@@ y @@3@@ fallidas.
Last run @@0@@@@1@@|Última ejecución @@0@@@@1@@
Next:|Siguiente:
Run the verified check to inspect every production dependency.|Ejecuta la verificación para comprobar las dependencias de producción.
Nothing is waiting. New content will appear here after quality review.|No hay contenido pendiente. Aparecerá aquí tras la revisión de calidad.
@@0@@ · Quality @@1@@%|@@0@@ · Calidad @@1@@%
No generation runs yet.|Todavía no hay tareas de generación.
Agent-selected topic|Tema elegido por el agente
@@0@@/@@1@@ stages saved@@2@@|@@0@@/@@1@@ etapas guardadas@@2@@
 · @@0@@ reused| · @@0@@ reutilizadas
Video: @@0@@/@@1@@ clips ready · @@2@@|Vídeo: @@0@@/@@1@@ clips listos · @@2@@
Resume|Reanudar
Stage to resume from|Etapa desde la que reanudar
No approved videos are scheduled.|No hay vídeos aprobados programados.
View|Ver
No activity has been recorded yet.|Todavía no se ha registrado actividad.
No content matches this view.|No hay contenido para esta vista.
State|Estado
Quality|Calidad
No topic recorded|Sin tema registrado
Fix issues|Corregir problemas
Add promising topics here before spending generation credits.|Añade temas prometedores antes de gastar créditos de generación.
No angle added|Sin enfoque añadido
Generate|Generar
Keep collecting results; recommendations get stronger with more published videos.|Sigue recopilando resultados: más vídeos publicados mejoran las recomendaciones.
Publish and analyze the first video to unlock performance recommendations.|Publica y analiza el primer vídeo para obtener recomendaciones de rendimiento.
Performance @@0@@ / 100|Rendimiento @@0@@ / 100
Untitled video|Vídeo sin título
No analyzed videos yet.|Todavía no hay vídeos analizados.
Choose a measurable primary outcome in the Autonomous Operator strategy.|Elige un resultado principal medible en la estrategia del operador autónomo.
Configure a primary outcome to activate goal-aligned learning.|Configura un resultado principal para orientar el aprendizaje hacia tu objetivo.
Awaiting evidence|Esperando datos
No numeric target · @@0@@-day evidence window|Sin objetivo numérico · periodo de @@0@@ días
@@0@@ target · @@1@@ days|Objetivo @@0@@ · @@1@@ días
@@0@@ · @@1@@ measured videos|@@0@@ · @@1@@ vídeos medidos
@@0@@% of target from stored measurement windows|@@0@@% del objetivo según los periodos de medición guardados
Outcome target progress|Progreso hacia el objetivo
Known production cost|Coste de producción conocido
Estimated ROI|Retorno estimado
Budget used|Presupuesto utilizado
@@0@@/@@1@@ videos measured|@@0@@/@@1@@ vídeos medidos
Production providers|Proveedores de producción
@@0@@ video@@1@@|@@0@@ vídeo@@1@@
@@0@@ avg|@@0@@ de media
Breakdowns appear once measured videos carry comparable pillar, format, or provider evidence.|Los desgloses aparecen cuando los vídeos medidos tienen datos comparables por pilar, formato o proveedor.
@@0@@ snapshots|@@0@@ mediciones
@@0@@ approved|@@0@@ aprobadas
Two real measurements unlock evidence-backed recommendations.|Dos mediciones reales permiten crear recomendaciones basadas en datos.
@@0@@ · @@1@@ confidence|@@0@@ · confianza @@1@@
Approve|Aprobar
Reject|Rechazar
No recommendation yet. Oraflow needs at least two real, sufficiently exposed measurements.|Aún no hay recomendaciones. Oraflow necesita al menos dos mediciones reales con exposición suficiente.
No eligible published variants|No hay variantes publicadas aptas
@@0@@ running · @@1@@ decision@@2@@|@@0@@ en curso · decisiones pendientes: @@1@@
Only real YouTube evidence advances controlled tests.|Las pruebas controladas avanzan solo con datos reales de YouTube.
Approve plan|Aprobar plan
Start live test|Iniciar prueba real
Refresh evidence|Actualizar datos
Cancel &amp; restore control|Cancelar y restaurar original
Retry control restore|Reintentar restauración del original
Adopt @@0@@|Adoptar @@0@@
@@0@@ impressions|@@0@@ impresiones
Control|Original
@@0@@h per arm · @@1@@ minimum impressions|@@0@@ h por variante · mínimo de @@1@@ impresiones
Result:|Resultado:
 · @@0@@% lift| · mejora del @@0@@%
Publish content with approved-learning title and thumbnail variants to create the first controlled test.|Publica contenido con variantes aprobadas de título y miniatura para crear la primera prueba controlada.
No measured curves yet|Todavía no hay curvas medidas
Retention curves appear after a published video reaches a real analytics measurement window.|Las curvas de retención aparecen cuando un vídeo publicado alcanza un periodo real de medición.
@@0@@ real points|@@0@@ puntos reales
@@0@@ scenes|@@0@@ escenas
@@0@@ drop-offs|@@0@@ caídas
@@0@@ rewatch signals|@@0@@ señales de repetición
@@0@@ confidence|Confianza @@0@@
@@0@@ window|Periodo @@0@@
Scene @@0@@|Escena @@0@@
Average watching|Visualización media
Scene change|Cambio de escena
Relative retention|Retención relativa
Sharpest drop|Mayor caída
The saved curve could not be mapped to a scene timeline.|No se pudo relacionar la curva guardada con la línea temporal de escenas.
posting enabled|publicación habilitada
Re-authorize YouTube (npm run walkthrough) to grant the comment permission.|Vuelve a autorizar YouTube (npm run walkthrough) para conceder permiso de comentarios.
@@0@@ drafts|@@0@@ borradores
@@0@@ flagged|@@0@@ marcados
@@0@@ pending|@@0@@ pendientes
No synced videos yet|Todavía no hay vídeos sincronizados
Comments appear after a published video is synced.|Los comentarios aparecen al sincronizar un vídeo publicado.
Draft replies from a synced video to review them here.|Prepara respuestas de un vídeo sincronizado para revisarlas aquí.
Nothing flagged as spam, scam, or toxic.|No hay comentarios marcados como spam, estafa o tóxicos.
@@0@@ comments|@@0@@ comentarios
@@0@@ analyzed|@@0@@ analizados
AI analysis unavailable — mechanical facts only|Análisis con IA no disponible: solo datos directos
@@0@@ positive · @@1@@ neutral · @@2@@ negative|@@0@@ positivos · @@1@@ neutros · @@2@@ negativos
synced @@0@@|sincronizado @@0@@
never synced|nunca sincronizado
Themes need a working AI text provider.|Los temas requieren un proveedor de texto con IA disponible.
No recurring themes yet.|Todavía no hay temas recurrentes.
Reply|Responder
Last attempt failed: @@0@@|El último intento falló: @@0@@
Approve &amp; post|Aprobar y publicar
Save edit|Guardar cambios
Discard|Descartar
No reply drafts for this video yet.|Todavía no hay borradores de respuesta para este vídeo.
Open on YouTube|Abrir en YouTube
Mined audience requests appear here once comment analysis finds repeated asks.|Las peticiones de la audiencia aparecen aquí cuando el análisis detecta solicitudes repetidas.
This snapshot does not contain enough points for a curve.|Esta medición no contiene suficientes puntos para una curva.
Audience retention for @@0@@|Retención de audiencia de @@0@@
A @@0@@-point audience retention curve divided by @@1@@ production scenes.|Curva de retención de @@0@@ puntos dividida en @@1@@ escenas.
Start|Inicio
End|Final
Setup ready|Configuración lista
First real MP4|Primer MP4 real
First approval|Primera aprobación
First YouTube publish|Primera publicación en YouTube
Second real MP4|Segundo MP4 real
Not reached yet|Todavía no alcanzado
Made something real with Oraflow?|¿Has creado algo con Oraflow?
Share what you built|Comparte lo que has creado
Resolve the production readiness failures first|Resuelve primero los fallos de preparación de producción
Run strategy now|Ejecutar estrategia ahora
Save a channel mandate, then activate it to research and produce the first plan.|Guarda las directrices del canal y actívalo para investigar y producir el primer plan.
No editorial plan yet.|Todavía no hay un plan editorial.
Research pending|Investigación pendiente
Status|Estado
Produced|Producido
Research and planning will appear here when the run begins.|La investigación y planificación aparecerán aquí al comenzar la ejecución.
@@0@@ paid provider(s) available; local slideshow remains the final fallback.|@@0@@ proveedor(es) de pago disponibles; la presentación local es la alternativa final.
Local FFmpeg slideshow is selected; no external video credentials are required.|Presentación local con FFmpeg seleccionada; no requiere credenciales externas de vídeo.
@@0@@ is configured (@@1@@).|@@0@@ está configurado (@@1@@).
@@0@@ credentials are not configured.|Las credenciales de @@0@@ no están configuradas.
Turn evidence into the next production.|Convierte la investigación en tu próxima producción.
AUTONOMOUS OPERATOR|OPERADOR AUTÓNOMO
Give Oraflow the strategy.|Dale una estrategia a Oraflow.
CONTENT OPERATIONS|OPERACIONES DE CONTENIDO
From idea to published.|De la idea a la publicación.
EDITORIAL PLANNING|PLANIFICACIÓN EDITORIAL
Plan before you generate.|Planifica antes de generar.
PERFORMANCE|RENDIMIENTO
Turn results into the next move.|Usa los resultados para decidir el próximo paso.
AUDIENCE ENGAGEMENT|INTERACCIÓN CON LA AUDIENCIA
Talk with the people watching.|Habla con quienes te ven.
PRODUCTION READINESS|PREPARACIÓN DE PRODUCCIÓN
Verify before autonomy runs.|Verifica antes de activar la autonomía.
CHANNEL GUARDRAILS|REGLAS DEL CANAL
Make every agent sound like you.|Haz que cada agente refleje tu voz.
Research source|Fuente de investigación
Remove|Eliminar
Publisher|Editor
Type|Tipo
Review status|Estado de revisión
Evidence notes|Notas de evidencia
Official source|Fuente oficial
Asset or license|Recurso o licencia
Pending review|Pendiente de revisión
Open source ↗|Abrir fuente ↗
Factual claim|Afirmación verificable
Claim|Afirmación
Risk|Riesgo
Resolution|Resolución
Supporting sources|Fuentes de apoyo
Reviewer notes|Notas del revisor
Required when waived|Obligatorio al hacer una excepción
High risk|Riesgo alto
Waived with note|Excepción justificada
Add a source before marking this claim supported.|Añade una fuente antes de marcar esta afirmación como respaldada.
Evidence verified|Evidencia verificada
No claims declared|Sin afirmaciones declaradas
@@0@@ unresolved|@@0@@ sin resolver
RESEARCH &amp; PROVENANCE|INVESTIGACIÓN Y PROCEDENCIA
Evidence desk|Mesa de evidencias
Verify sources, connect every factual claim, and record disclosure before approval.|Verifica las fuentes, respalda cada afirmación y registra las declaraciones antes de aprobar.
Sources|Fuentes
Claims|Afirmaciones
Contains realistic altered or synthetic media requiring YouTube disclosure|Contiene medios realistas alterados o sintéticos que requieren declaración en YouTube
Add source +|Añadir fuente +
No research sources attached.|Sin fuentes de investigación adjuntas.
Add claim +|Añadir afirmación +
No externally verifiable claims declared.|No hay afirmaciones verificables externamente declaradas.
Save evidence review|Guardar revisión de evidencias
Not run|Sin ejecutar
@@0@@ finding@@1@@|@@0@@ hallazgo@@1@@
DISCOVERABILITY PREFLIGHT|REVISIÓN DE VISIBILIDAD
DarkzSEO review|Revisión de DarkzSEO
Review GEO, AIO, AEO, and web-search guidance against this content package. Findings are advisory and never rewrite or publish content.|Revisa las recomendaciones GEO, AIO, AEO y de búsqueda web del contenido. Son orientativas y nunca reescriben ni publican contenido.
Run again|Volver a ejecutar
Run audit|Ejecutar auditoría
DarkzSEO could not run@@0@@: @@1@@|No se pudo ejecutar DarkzSEO@@0@@: @@1@@
Keep as actionable|Mantener como acción pendiente
Dismiss false positive|Descartar falso positivo
Reviewer note: @@0@@|Nota del revisor: @@0@@
No discoverability findings. The content package passed the configured advisory checks.|Sin hallazgos de visibilidad. El contenido superó las comprobaciones orientativas configuradas.
Run DarkzSEO to create a versioned, reviewable audit for this production.|Ejecuta DarkzSEO para crear una auditoría versionada y revisable de esta producción.
SCENE REPAIR STUDIO|REPARACIÓN DE ESCENAS
Repair the timeline, not the whole video|Repara una parte de la línea temporal
Edit, replace, or regenerate one scene. Changes remain draft-only until the timeline is rebuilt and approved.|Edita, sustituye o regenera una escena. Los cambios siguen como borrador hasta reconstruir y aprobar la línea temporal.
NARRATION RELIABILITY|FIABILIDAD DE LA NARRACIÓN
@@0@@s timeline|Línea temporal de @@0@@ s
@@0@@ pending repairs|@@0@@ reparaciones pendientes
Rebuild final video|Reconstruir vídeo final
Intentional silence confirmed|Silencio intencional confirmado
@@0@@ scene@@1@@ need narration|Escenas que necesitan narración: @@0@@
Narration evidence is current|La evidencia de narración está actualizada
Regenerate narration without replacing the scene visual. Approval remains blocked until audio is ready.|Regenera la narración conservando la imagen. La aprobación sigue bloqueada hasta que el audio esté listo.
 · task @@0@@| · tarea @@0@@
Require narration|Exigir narración
Use intentional silence|Usar silencio intencional
@@0@@ scene asset|Recurso de escena @@0@@
No scene asset|Sin recurso de escena
Scene label|Nombre de escena
Duration|Duración
Narration|Narración
Visual prompt|Prompt visual
Narration changes may contain factual claims|Los cambios de narración pueden contener afirmaciones verificables
Visual: @@0@@ @@1@@|Imagen: @@0@@ @@1@@
Narration: @@0@@@@1@@@@2@@|Narración: @@0@@@@1@@@@2@@
Verified evidence linked to this narration|Evidencia verificada vinculada a esta narración
not generated|sin generar
↑ Earlier|↑ Antes
↓ Later|↓ Después
Save scene|Guardar escena
Regenerate narration only|Regenerar solo narración
Regenerate scene|Regenerar escena
Replace asset|Sustituir recurso
SHORTS REPURPOSING STUDIO|CREACIÓN DE SHORTS
Turn one production into vertical reach|Convierte una producción en vídeos verticales
Create local 9:16 excerpts with mobile captions. Drafts inherit the source production's evidence and still require separate approval.|Crea extractos locales 9:16 con subtítulos para móvil. Heredan las evidencias de la producción original y requieren aprobación independiente.
Local render · no new provider call|Renderizado local · sin nueva llamada al proveedor
Refresh drafts|Actualizar borradores
Create 3 Short drafts|Crear 3 borradores de Shorts
Source approval required before scheduling|Aprueba el original antes de programar
No factual claims declared|Sin afirmaciones verificables declaradas
Evidence review incomplete|Revisión de evidencias incompleta
Short title|Título del Short
Description and parent-video CTA|Descripción y llamada al vídeo original
Tags|Etiquetas
Vertical layout|Composición vertical
Blurred canvas|Fondo difuminado
Center crop|Recorte centrado
Stacked focus|Enfoque apilado
Publish time|Hora de publicación
Privacy|Privacidad
Private|Privado
Unlisted|No listado
Public|Público
@@0@@ layout|Composición @@0@@
Open published Short ↗|Abrir Short publicado ↗
Save draft|Guardar borrador
Approve &amp; schedule|Aprobar y programar
Render again|Volver a renderizar
Render 9:16|Renderizar 9:16
Approve the source production first|Aprueba primero la producción original
Render this Short first|Renderiza primero este Short
Confirm and schedule this Short|Confirmar y programar este Short
No Short drafts yet. Create three candidates from the current scene timeline without calling a paid provider.|Todavía no hay borradores de Shorts. Crea tres candidatos de la línea temporal actual sin usar un proveedor de pago.
Untitled content|Contenido sin título
CONTENT REVIEW|REVISIÓN DE CONTENIDO
Review & edit|Revisar y editar
Storyboard|Guion visual
Title|Título
Description|Descripción
Facts and claims reviewed|Hechos y afirmaciones revisados
Media rights confirmed|Derechos de los medios confirmados
Production detail|Detalle de producción
Generated thumbnail|Miniatura generada
No playable preview was produced.|No se generó una vista previa reproducible.
No quality results recorded.|No hay resultados de calidad registrados.
APPROVED LEARNING EXPERIMENT|EXPERIMENTO DE APRENDIZAJE APROBADO
Choose the packaging to ship. Nothing changes on YouTube until this content is approved and published.|Elige la presentación que publicarás. No cambia nada en YouTube hasta aprobar y publicar este contenido.
Title variant|Variante de título
@@0@@ thumbnail variant|Variante de miniatura @@0@@
Regenerate|Regenerar
Confirm you own or have permission to use this replacement asset.|Confirma que eres titular o tienes permiso para usar este recurso de sustitución.
Does this replacement contain realistic altered or synthetic media that should be disclosed to YouTube?|¿El reemplazo contiene medios realistas alterados o sintéticos que deban declararse a YouTube?
Scene asset replaced. Rebuild before approval.|Recurso de escena sustituido. Reconstruye antes de aprobar.
New source|Nueva fuente
Cancel this generation job after its current stage?|¿Cancelar esta generación después de la etapa actual?
Resume this job from @@0@@? Later checkpoints will be regenerated.|¿Reanudar desde @@0@@? Se regenerarán las etapas posteriores.
Generation resumed from @@0@@.|Generación reanudada desde @@0@@.
Learning approved for future autonomous plans.|Aprendizaje aprobado para futuros planes autónomos.
Learning rejected and excluded from future plans.|Aprendizaje rechazado y excluido de futuros planes.
Approve this complete experiment plan? This does not change YouTube yet.|¿Aprobar el plan completo del experimento? Esto todavía no cambia YouTube.
Start this live test? Oraflow will rotate only the approved arms and restore the control before asking you to adopt a winner.|¿Iniciar la prueba real? Oraflow alternará las variantes aprobadas y restaurará el original antes de pedirte elegir una ganadora.
Adopt the evidence-backed winner on YouTube and approve its learning for future plans?|¿Adoptar la ganadora respaldada por datos en YouTube y aprobar su aprendizaje para futuros planes?
Cancel this experiment and restore the control title and thumbnail?|¿Cancelar el experimento y restaurar el título y miniatura originales?
Experiment plan approved.|Plan de experimento aprobado.
Controlled experiment started.|Experimento controlado iniciado.
Experiment evidence refreshed.|Datos del experimento actualizados.
Winner adopted and approved for future planning.|Ganadora adoptada y aprobada para futuros planes.
Experiment cancelled and control restored.|Experimento cancelado y original restaurado.
Retention curve refreshed from YouTube Analytics.|Curva de retención actualizada desde YouTube Analytics.
Reply text is empty.|La respuesta está vacía.
Post this reply to YouTube? @@0@@|¿Publicar esta respuesta en YouTube? @@0@@
Replace the current editable Short drafts? Rendered draft files will remain on disk but their manifest will be replaced.|¿Sustituir los borradores editables actuales de Shorts? Los archivos renderizados seguirán en disco; se sustituirá su registro.
Three local Short drafts created from the current scene timeline.|Tres borradores locales de Shorts creados con la línea temporal actual.
Discoverability preflight refreshed. Findings remain advisory until reviewed.|Revisión de visibilidad actualizada. Los hallazgos siguen siendo orientativos hasta revisarlos.
Why is this finding a false positive? The reason will be retained on future matching audits.|¿Por qué es un falso positivo? El motivo se conservará en futuras auditorías coincidentes.
Finding dismissed with reviewer evidence.|Hallazgo descartado con evidencia del revisor.
Finding kept as an actionable recommendation.|Hallazgo conservado como recomendación pendiente.
Short draft saved.|Borrador de Short guardado.
Vertical Short rendered locally with mobile captions.|Short vertical renderizado localmente con subtítulos para móvil.
Confirm the inherited evidence, media rights, privacy, and publish time for this Short?|¿Confirmas la evidencia heredada, derechos, privacidad y hora de publicación de este Short?
Short approved and added to the publishing schedule.|Short aprobado y añadido al calendario de publicación.
Scene unlocked.|Escena desbloqueada.
Scene locked.|Escena bloqueada.
Timeline order updated. Rebuild before approval.|Orden de la línea temporal actualizado. Reconstruye antes de aprobar.
Scene draft saved.|Borrador de escena guardado.
Regenerate narration for only this scene? This may consume TTS provider credits; the provider invoice is authoritative.|¿Regenerar solo la narración de esta escena? Puede consumir créditos de voz; el coste definitivo lo indica el proveedor.
Scene narration regenerated. Rebuild the final video when every narration segment is ready.|Narración de escena regenerada. Reconstruye el vídeo final cuando estén listos todos los segmentos.
Regenerate only this scene with @@0@@ (@@1@@s). This consumes provider credits; the provider invoice is authoritative. Continue?|Regenerar solo esta escena con @@0@@ (@@1@@ s) consume créditos del proveedor. El coste definitivo lo indica el proveedor. ¿Continuar?
Regenerate only this scene with the configured image provider? A live image request may consume provider credits. Continue?|¿Regenerar solo esta escena con el proveedor de imágenes configurado? Puede consumir créditos. ¿Continuar?
Scene regenerated. Rebuild the final video when the timeline is ready.|Escena regenerada. Reconstruye el vídeo final cuando esté lista la línea temporal.
Why is this production intentionally silent? This reason is stored with the approval evidence.|¿Por qué esta producción es intencionalmente silenciosa? El motivo se guarda con las evidencias de aprobación.
Confirm that this production is intentionally silent. Captions and visuals will remain, and approval will record this override.|Confirma el silencio intencional. Se conservarán subtítulos e imágenes y la aprobación registrará esta excepción.
Require narration again? Approval will be blocked until missing scene narration is regenerated and the video is rebuilt.|¿Volver a exigir narración? La aprobación se bloqueará hasta regenerar la narración pendiente y reconstruir el vídeo.
Intentional silence recorded. Rebuild before approval.|Silencio intencional registrado. Reconstruye antes de aprobar.
Narration is required again.|La narración vuelve a ser obligatoria.
Rebuild a new final MP4 from the current scene timeline? The previous final video will be preserved.|¿Reconstruir un nuevo MP4 final con las escenas actuales? Se conservará el vídeo final anterior.
Final video rebuilt from the repaired timeline. Review it before approval.|Vídeo final reconstruido con la línea temporal reparada. Revísalo antes de aprobar.
Evidence review saved.|Revisión de evidencias guardada.
Why are you rejecting this content?|¿Por qué rechazas este contenido?
Needs a different angle|Necesita otro enfoque
Generate a fresh version using the same topic?|¿Generar una nueva versión con el mismo tema?
Running live checks…|Ejecutando pruebas reales…
Automation @@0@@d.|Automatización: @@0@@.
Stop this autonomous run after the current agent stage?|¿Detener esta ejecución autónoma al terminar la etapa actual?
Resume this operator run from its saved editorial plan and generation checkpoints?|¿Reanudar esta ejecución desde su plan editorial y etapas guardadas?
Dashboard API key saved in this browser.|Clave API del panel guardada en este navegador.
esc|esc
navigate|navegar
run|ejecutar
Oraflow console|Consola de Oraflow
Command palette|Paleta de comandos
Jump to a view, run a command…|Ir a una vista, ejecutar un comando…
Command input|Entrada de comandos
Commands|Comandos
Create video|Crear vídeo
Queue a new generation job|Encolar una nueva generación
Add backlog idea|Añadir idea pendiente
Save a topic for later|Guardar un tema para después
Run verified readiness check|Verificar preparación
Prove the production path|Verificar el proceso de producción
Unpause the scheduler|Reanudar el programador
Halt scheduled generation|Detener la generación programada
Refresh dashboard data|Actualizar datos del panel
Pull latest state now|Obtener el estado actual
Store access key in this browser|Guardar clave de acceso en este navegador
No matching commands.|No hay comandos coincidentes.
Search|Buscar
The radar is ready for a market.|El radar está listo para investigar un mercado.
Try “prayer and spiritual wellness”, “retirement health”, or another broad direction.|Prueba «oración y bienestar espiritual», «salud en la jubilación» u otro tema amplio.
Scan could not finish.|No se pudo completar el análisis.
The research provider returned an error.|El proveedor de investigación devolvió un error.
Now|Ahora
30 days|30 días
Demand|Demanda
Low supply|Poca oferta
Monetization|Monetización
Confidence|Confianza
Validate evidence|Validar evidencia
Produce now|Producir ahora
Opportunity score @@0@@ and next month signal @@1@@|Puntuación de oportunidad @@0@@ y señal del próximo mes @@1@@
engine discovery|descubrimiento del motor
Signal unavailable|Señal no disponible
Rising searches|Búsquedas en alza
@@0@@ median views/day|@@0@@ visualizaciones diarias medianas
@@0@@ recent hits|@@0@@ éxitos recientes
@@0@@ credible competitors|@@0@@ competidores con datos fiables
This scan has no ranked opportunities.|Este análisis no tiene oportunidades clasificadas.
Setup needed|Configuración necesaria
Source|Fuente
YouTube access|Acceso a YouTube
Forecast|Previsión
Directional · 30 days|Orientativa · 30 días
Connecting to the private research engine…|Conectando con el motor privado de investigación…
Scan in progress…|Análisis en curso…
Recent scans|Análisis recientes
No scans saved yet.|Todavía no hay análisis guardados.
@@0@@ opportunities ranked from live demand and supply evidence.|@@0@@ oportunidades clasificadas con datos reales de demanda y oferta.
The previous scan stopped before a reliable ranking was produced.|El análisis anterior se detuvo antes de obtener una clasificación fiable.
The engine is expanding candidates and collecting comparable evidence.|El motor busca más candidatos y recopila datos comparables.
Add the first comparable channel to calculate a niche verdict.|Añade el primer canal comparable para evaluar el nicho.
Winning channels|Canales ganadores
Under 12 months|Menos de 12 meses
English winners|Ganadores en inglés
Spanish demand|Demanda en español
Current verdict|Evaluación actual
@@0@@ · @@1@@ views/month · @@2@@ min|@@0@@ · @@1@@ visualizaciones al mes · @@2@@ min
No channels saved yet.|Todavía no hay canales guardados.
Emotion|Emoción
Validate niche|Validar nicho
No candidates match this theme.|No hay candidatos para este tema.
Enter a subject to generate six title directions.|Introduce un tema para generar seis enfoques de título.
@@0@@ winners from @@1@@ channels|@@0@@ ganadores de @@1@@ canales
Open evidence|Abrir evidencias
No niche evidence has been saved yet.|Todavía no se han guardado evidencias de nichos.
No research notes have been saved yet.|Todavía no se han guardado notas de investigación.
No prompt templates are available.|No hay plantillas de prompts disponibles.
@@0@@. Check the private yt-inbox connection.|@@0@@. Revisa la conexión privada de yt-inbox.
Selected in Research Inbox|Seleccionado en la bandeja de investigación
Research idea sent to the production pipeline.|Idea de investigación enviada a producción.
Research idea added to the editorial backlog.|Idea de investigación añadida a pendientes editoriales.
@@0@@; demand @@1@@; low supply @@2@@|@@0@@; demanda @@1@@; poca oferta @@2@@
Opportunity radar @@0@@ · 30-day potential @@1@@|Radar de oportunidades @@0@@ · potencial a 30 días @@1@@
Title hook selected in Research Inbox|Gancho de título seleccionado en la bandeja de investigación
Niche scan started. You can keep using the dashboard while it runs.|Análisis de nicho iniciado. Puedes seguir usando el panel mientras se ejecuta.
Channel evidence saved and niche verdict updated.|Datos del canal guardados y evaluación del nicho actualizada.
Research note saved in the shared archive.|Nota de investigación guardada en el archivo compartido.
Completed prompt copied.|Prompt completo copiado.
Prompt selected. Use your browser copy command.|Prompt seleccionado. Usa el comando de copiar del navegador.
Shot @@0@@|Plano @@0@@
Motion: @@0@@ · Transition: @@1@@|Movimiento: @@0@@ · Transición: @@1@@
Selected video asset|Vídeo seleccionado
Selected image asset|Imagen seleccionada
No preview available|Vista previa no disponible
Selected asset|Recurso seleccionado
License: @@0@@|Licencia: @@0@@
No asset selected yet|Todavía no hay un recurso seleccionado
Search: @@0@@|Búsqueda: @@0@@
The storyboard has no scenes yet.|El guion visual todavía no tiene escenas.
Scenes|Escenas
Shots|Planos
Captions|Subtítulos
Timing source|Origen de tiempos
 · Updated @@0@@| · Actualizado @@0@@
Production checks @@0@@|Comprobaciones de producción @@0@@
Visual intent|Intención visual
Captions (@@0@@)|Subtítulos (@@0@@)
No visual intent recorded.|Sin intención visual registrada.
No narration recorded.|Sin narración registrada.
No shots planned yet.|Todavía no hay planos previstos.
No captions generated for this scene yet.|Todavía no hay subtítulos generados para esta escena.
Loading storyboard…|Cargando guion visual…
This production has no storyboard yet. It will appear after the storyboard production pipeline runs.|Esta producción todavía no tiene guion visual. Aparecerá al ejecutar el proceso de producción con storyboard.
Unable to load the storyboard.|No se pudo cargar el guion visual.
Try again|Reintentar
unknown|desconocido
complete|completo
completed|completado
needs review|pendiente de revisión
needs attention|requiere atención
queued|en cola
running|en curso
failed|fallido
passed|correcto
warning|aviso
pending|pendiente
approved|aprobado
rejected|rechazado
published|publicado
scheduled|programado
draft|borrador
cancelled|cancelado
interrupted|interrumpido
strategy|estrategia
script|guion
thumbnail|miniatura
production|producción
quality review|revisión de calidad
connected|conectado
connecting|conectando
waiting|en espera
offline|sin conexión
image|imagen
video|vídeo
none|ninguno
cut|corte
fade|fundido
crossfade|fundido cruzado
estimated|estimado
local|local
generated|generado
Scene|Escena
Operator|Operador
Calendar|Calendario
Readiness|Preparación
Setup|Configuración
Navigate|Navegar
Command|Comando
Actions|Acciones
Review|Revisar
Inspect|Inspeccionar
Unavailable|No disponible
Measuring|Midiendo
Formats|Formatos
Retention|Retención
Performance|Rendimiento
Viewer|Espectador
Article|Artículo
Video|Vídeo
Dataset|Conjunto de datos
Other|Otro
Verified|Verificado
Rejected|Rechazado
Standard|Estándar
Pending|Pendiente
Supported|Respaldado
Unsupported|Sin respaldo
Unlock|Desbloquear
Lock|Bloquear
Cancellation requested.|Cancelación solicitada.
Idea queued for generation.|Idea encolada para generación.
Comments synced from YouTube.|Comentarios sincronizados desde YouTube.
Reply drafts created for review.|Borradores de respuesta creados para revisión.
Reply draft updated.|Borrador de respuesta actualizado.
Reply draft discarded.|Borrador de respuesta descartado.
Reply posted to YouTube.|Respuesta publicada en YouTube.
Draft and evidence review saved.|Borrador y revisión de evidencias guardados.
Content approved and scheduled.|Contenido aprobado y programado.
Content rejected.|Contenido rechazado.
Regeneration started.|Regeneración iniciada.
Draft growth experiment created for review.|Borrador de experimento de crecimiento creado para revisión.
Production readiness check completed.|Comprobación de preparación completada.
Channel strategy saved.|Estrategia del canal guardada.
Autonomous operator started.|Operador autónomo iniciado.
Autonomous operator paused.|Operador autónomo pausado.
Operator stop requested.|Detención del operador solicitada.
Autonomous operator resumed.|Operador autónomo reanudado.
Generation job started.|Tarea de generación iniciada.
Idea added to the backlog.|Idea añadida a pendientes.
Channel setup saved.|Configuración del canal guardada.
Operator settings saved.|Ajustes del operador guardados.
Home|Inicio
Stats|Datos
Audience|Audiencia
Checks|Pruebas
Open command palette|Abrir paleta de comandos
Checking|Comprobando
Ready|Listo
Configured|Configurado
Idle|Inactivo
idle|inactivo
unverified|sin verificar
not configured|sin configurar
zoom in|acercamiento
zoom out|alejamiento
pan left|desplazamiento a la izquierda
pan right|desplazamiento a la derecha
Shorts|Shorts
Clipping|Clipping
VERSE SHORTS|SHORTS DE VERSÍCULOS
Verses in, shorts out.|Entran versículos, salen shorts.
CLIPPING|CLIPPING
Long videos into short clips.|De videos largos a clips cortos.
Verse Shorts|Shorts de versículos
Write the verses, press make, download the shorts.|Escribe los versículos, pulsa hacer y descarga los shorts.
The Shorts project folder is not mounted. Check SHORTS_DIR in the container.|La carpeta del proyecto de Shorts no está montada. Revisa SHORTS_DIR en el contenedor.
Shorts workflow|Flujo de los shorts
Backgrounds & music|Fondos y música
Pexels, Pixabay, YouTube Audio Library|Pexels, Pixabay, Biblioteca de audio de YouTube
Verses|Versículos
Only the citation is needed|Basta con la cita
Download & upload|Descarga y sube
Title and description included|Con título y descripción
STEP 2 · VERSES|PASO 2 · VERSÍCULOS
Batch of shorts|Lote de shorts
One short per block. Separate blocks with a line containing|Un short por bloque. Separa los bloques con una línea que tenga
. The verse text comes from the Reina-Valera 1909 (public domain).|. El texto sale de la Reina-Valera 1909 (dominio público).
Examples|Ejemplos
Save batch|Guardar lote
Make all shorts|Hacer todos los shorts
STEP 1 · BACKGROUNDS|PASO 1 · FONDOS
Background videos|Videos de fondo
Upload|Subir
Landscapes, sky, water or light. They are cropped to vertical automatically and picked at random.|Paisajes, cielo, agua o luz. Se recortan solos a vertical y se eligen al azar.
STEP 1 · MUSIC|PASO 1 · MÚSICA
Music|Música
Tracks from the YouTube Audio Library. If a track requires attribution, paste it under the track: it goes into every description.|Pistas de la Biblioteca de audio de YouTube. Si una pide atribución, pégala debajo de la pista: sale en cada descripción.
PROGRESS|PROGRESO
Working…|Trabajando…
Stop|Detener
STEP 3 · RESULTS|PASO 3 · RESULTADOS
Your shorts|Tus shorts
Vertical clips with captions and Bible references, for campaigns that pay per view.|Clips verticales con subtítulos y citas bíblicas, para campañas que pagan por vistas.
Only clip videos you have permission for (campaign material or your own). Read each campaign's rules: some forbid added music or require a hashtag.|Recorta solo videos con permiso (material de la campaña o tuyo). Lee las reglas de cada campaña: algunas prohíben música añadida o piden un hashtag.
SOURCE VIDEOS|VIDEOS DE ORIGEN
Videos to clip|Videos para recortar
Upload video|Subir video
Framing|Encuadre
Fill the screen (crop sides)|Llenar la pantalla (recorta los lados)
Whole video on blurred background|Video entero con fondo difuminado
Transcription quality|Calidad de la transcripción
Fast|Rápida
Good (recommended)|Buena (recomendada)
Best · about 3× slower|La mejor · unas 3 veces más lenta
RESULTS|RESULTADOS
Your clips|Tus clips
Not available|No disponible
Working|Trabajando
Unsaved changes|Cambios sin guardar
Saved|Guardado
No backgrounds yet. Without one, shorts use a plain dark background.|Aún no hay fondos. Sin fondo, los shorts usan un color oscuro liso.
Delete|Borrar
Attribution, if the track requires it|Atribución, si la pista la pide
Attribution for @@0@@|Atribución de @@0@@
No music yet. Without music, shorts are silent.|Aún no hay música. Sin música, los shorts salen sin sonido.
From|Desde
To|Hasta
end|final
Make clip|Hacer clip
Upload a campaign video to start.|Sube un video de la campaña para empezar.
@@0@@ shorts|@@0@@ shorts
@@0@@ clips|@@0@@ clips
Download|Descargar
Copy title|Copiar título
Copy description|Copiar descripción
Your shorts will appear here. Write the verses and press “Make all shorts”.|Tus shorts aparecerán aquí. Escribe los versículos y pulsa «Hacer todos los shorts».
Finished clips will appear here.|Los clips terminados aparecerán aquí.
Transcribing and cutting…|Transcribiendo y cortando…
Making shorts…|Haciendo shorts…
Finished|Terminado
Finished with errors|Terminado con errores
Stopped|Detenido
Starting…|Empezando…
Done. Your videos are ready below.|Listo. Tus videos están abajo.
The job finished with errors. Check the progress log.|El trabajo terminó con errores. Revisa el progreso.
Job stopped.|Trabajo detenido.
Started. You can keep using the dashboard.|En marcha. Puedes seguir usando el panel.
Batch saved.|Lote guardado.
The file is too large.|El archivo es demasiado grande.
Upload failed|Falló la subida
Upload failed. Check your connection.|Falló la subida. Revisa tu conexión.
Confirm you have permission to clip these videos (campaign material or your own).|Confirma que tienes permiso para recortar estos videos (material de la campaña o tuyo).
Confirm these files are free to use (Pexels, Pixabay, YouTube Audio Library or your own).|Confirma que estos archivos son de uso libre (Pexels, Pixabay, Biblioteca de audio de YouTube o tuyos).
@@0@@ files uploaded.|@@0@@ archivos subidos.
Attribution saved.|Atribución guardada.
Delete @@0@@?|¿Borrar @@0@@?
Copied.|Copiado.
Copy this text:|Copia este texto:
Accounts|Cuentas
Guides|Guías
Create|Crear
Channel|Canal
System|Sistema
ACCOUNTS|CUENTAS
Every connection, tested.|Cada conexión, comprobada.
GUIDES|GUÍAS
How to get the most out of Oraflow.|Cómo sacarle el máximo a Oraflow.
Accounts & keys|Cuentas y claves
See what is connected, test it for real and reconnect your channel. Keys are never shown here.|Mira qué está conectado, pruébalo de verdad y reconecta tu canal. Aquí nunca se muestran las claves.
Test everything|Probar todo
PUBLISHING|PUBLICACIÓN
YouTube channel|Canal de YouTube
Checking|Comprobando
Oraflow publishes with your permission (OAuth). Two pieces are needed: the Google OAuth client (from Google Cloud) and the channel's permission (the “Connect channel” button).|Oraflow publica con tu permiso (OAuth). Hacen falta dos piezas: el cliente OAuth de Google (de Google Cloud) y el permiso del canal (el botón «Conectar canal»).
Test connection|Probar conexión
Connect channel|Conectar canal
Replace OAuth client|Reemplazar cliente OAuth
Open|Abre
Google Cloud → Credentials|Google Cloud → Credenciales
and create an|y crea un
OAuth client ID|ID de cliente de OAuth
of type|de tipo
Web application|Aplicación web
Under “Authorized redirect URIs” add exactly:|En «URI de redireccionamiento autorizados» añade exactamente:
Copy|Copiar
Paste the client ID and secret here, save, and press “Connect channel”.|Pega aquí el ID y el secreto del cliente, guarda y pulsa «Conectar canal».
Client ID|ID de cliente
Client secret|Secreto del cliente
Stored only on the server. It is never shown again.|Se guarda solo en el servidor. No se vuelve a mostrar.
Save client|Guardar cliente
Keys marked “from .env” are changed on the server, in|Las claves marcadas «del .env» se cambian en el servidor, en
, and need a restart of the container. The guide “Accounts and keys” explains each one.|, y necesitan reiniciar el contenedor. La guía «Cuentas y claves» explica cada una.
Search guides|Buscar guías
Missing|Falta
Not connected|Sin conectar
Works|Funciona
Error|Error
from .env|del .env
from credentials file|del archivo de credenciales
OAuth client|Cliente OAuth
Channel permission|Permiso del canal
Permissions|Permisos
granted|concedido
not granted|sin conceder
Test|Probar
Testing…|Probando…
First save a Google OAuth client.|Primero guarda un cliente OAuth de Google.
OAuth client saved. Now press “Connect channel”.|Cliente OAuth guardado. Ahora pulsa «Conectar canal».
Channel connected. Press “Test connection” to confirm which channel it is.|Canal conectado. Pulsa «Probar conexión» para confirmar qué canal es.
The saved return address (“oob”) is no longer accepted by Google. The channel keeps working, but if you ever need to reconnect, first replace the OAuth client below.|Google ya no acepta la dirección de retorno guardada («oob»). El canal sigue funcionando, pero si alguna vez hay que reconectar, primero reemplaza el cliente OAuth aquí abajo.
The channel permission does not include uploading videos: connect again.|El permiso del canal no incluye subir videos: vuelve a conectar.
YouTube Data API|YouTube Data API
Research radar: reads public YouTube data. It does not publish.|Radar de investigación: lee datos públicos de YouTube. No publica.
Writes scripts, titles and descriptions (AI text).|Escribe guiones, títulos y descripciones (texto con IA).
Images and AI video clips; also AI text if selected.|Imágenes y clips de video con IA; también texto si se elige.
Images and voice if configured.|Imágenes y voz, si se configura.
Narration voice of the videos.|La voz que narra los videos.
Free stock photos and videos for scenes.|Fotos y videos de stock gratis para las escenas.
Dashboard API key|API key del panel
Protects the buttons that change things. Without it, anyone who passes the Google login can use them.|Protege los botones que cambian cosas. Sin ella, cualquiera que pase el login de Google puede usarlos.
Render every short in the batch|Hace cada short del lote
Upload background videos|Subir videos de fondo
Pexels, Pixabay or your own|Pexels, Pixabay o tuyos
Upload music|Subir música
YouTube Audio Library tracks|Pistas de la Biblioteca de audio de YouTube
Upload a video to clip|Subir un video para recortar
Campaign material|Material de la campaña
Test every account|Probar todas las cuentas
Check all keys and the channel|Comprueba todas las claves y el canal
Connect YouTube channel|Conectar canal de YouTube
Give Oraflow permission to publish|Da permiso a Oraflow para publicar
Videos|Vídeos
No results for|Sin resultados para
Try fewer words, or search the guides.|Prueba con menos palabras o busca en las guías.
Today|Hoy
Plan|Planificar
Results|Resultados
Help|Ayuda
Autopilot|Piloto automático
Production|Producción
Accounts & channel|Cuentas y canal
Shortcuts|Atajos
Search everything|Buscar en todo
Menu|Menú
Close|Cerrar
Open menu|Abrir menú
← Main panel|← Panel principal
OUTLIERS|OUTLIERS
Outliers|Outliers
What already works, before you film.|Lo que ya funciona, antes de grabar.
Videos that beat their own channel by far. What already works, before you film.|Vídeos que superan con mucho a su propio canal. Lo que ya funciona, antes de grabar.
YOUTUBE · PUBLIC DATA|YOUTUBE · DATOS PÚBLICOS
Search a topic|Busca un tema
Score = video views ÷ median views of the channel's last 30 videos. 40× means it did 40 times better than usual for that channel.|Puntuación = vistas del vídeo ÷ mediana de vistas de los últimos 30 vídeos del canal. 40× significa que le fue 40 veces mejor de lo normal en ese canal.
Portuguese|Portugués
Country|País
All|Todos
Long (over 3 min)|Largos (más de 3 min)
Published in the last|Publicados en los últimos
6 months|6 meses
1 year|1 año
2 years|2 años
Minimum score|Puntuación mínima
Minimum views|Vistas mínimas
Find outliers|Buscar outliers
Best first|Los mejores primero
Searching|Buscando
subs|suscriptores
views|vistas
channel median|mediana del canal
from cache|de la caché
@@0@@ of @@1@@ videos beat their channel @@2@@× or more · @@3@@ quota units|@@0@@ de @@1@@ vídeos superan @@2@@× a su canal · @@3@@ unidades de cuota
Type a topic and search. Each search uses about 150–300 of the 10,000 daily YouTube API units.|Escribe un tema y busca. Cada búsqueda gasta unas 150–300 de las 10.000 unidades diarias de la API de YouTube.
No video beats its channel by that much. Lower the minimum or widen the dates.|Ningún vídeo supera tanto a su canal. Baja el mínimo o amplía las fechas.
`;

  const normalize = value => String(value).replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#039;', "'").replace(/\s+/g, ' ').trim();
  const catalogue = new Map();
  function canonical(value, slots = new Map()) {
    return normalize(value).replace(/@@(\d+)@@/g, (marker, id) => {
      if (!slots.has(id)) slots.set(id, slots.size);
      return `@@${slots.get(id)}@@`;
    });
  }
  for (const line of `${entries}\n${dynamicEntries}`.split('\n')) {
    const split = line.indexOf('|');
    if (split < 0) continue;
    const slots = new Map();
    const key = canonical(line.slice(0, split), slots);
    catalogue.set(key, canonical(line.slice(split + 1), slots));
  }
  // The language saved in the user's profile wins; with none saved yet, the
  // browser decides (a Spanish browser gets Spanish, anything else English).
  const browser = /^es\b/i.test((window.navigator && window.navigator.language) || '') ? 'es' : 'en';
  let language = browser;
  try { language = localStorage.getItem('oraflow_language') || browser; } catch (_) { language = browser; }
  if (!['es', 'en'].includes(language)) language = 'en';

  function t(source) {
    if (language === 'en') return source;
    const slots = new Map();
    const key = canonical(source, slots);
    const translated = catalogue.get(key);
    if (translated === undefined) return source;
    const ids = [...slots.keys()];
    const text = translated.replace(/@@(\d+)@@/g, (_, index) => `@@${ids[Number(index)]}@@`);
    return String(source).match(/^\s*/)[0] + text + String(source).match(/\s*$/)[0];
  }

  function markup(source) {
    // Only literal interface text/attributes are translated; interpolated data is
    // still represented by opaque placeholders at this point.
    return source.replace(/(^|>)([^<]*)(?=<|$)/g, (_, edge, value) => edge + t(value))
      .replace(/\b(aria-label|title|placeholder|alt)="([^"]*)"/g, (_, name, value) => `${name}="${t(value)}"`);
  }

  function template(strings, values, html) {
    const source = strings.reduce((text, part, index) => text + part + (index < values.length ? `@@${index}@@` : ''), '');
    return (html ? markup(source) : t(source)).replace(/@@(\d+)@@/g, (_, index) => String(values[Number(index)] ?? ''));
  }
  window.i18n = Object.freeze({
    t, markup,
    html: (strings, ...values) => template(strings, values, true),
    msg: (strings, ...values) => template(strings, values, false),
    language,
    locale: language === 'es' ? 'es-ES' : 'en-US'
  });
  document.documentElement.lang = language;
  // Runs once before app.js. Never observes or translates later user content.
  const walker = document.createTreeWalker(document.documentElement, window.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement?.closest('script, style, textarea, code')) node.nodeValue = t(node.nodeValue);
  }
  document.querySelectorAll('[aria-label], [title], [placeholder], [alt]').forEach(element => {
    for (const name of ['aria-label', 'title', 'placeholder', 'alt']) {
      if (element.hasAttribute(name)) element.setAttribute(name, t(element.getAttribute(name)));
    }
  });
  const selector = document.querySelector('#language-select');
  selector.value = language;
  selector.addEventListener('change', () => {
    try { localStorage.setItem('oraflow_language', selector.value); } catch (_) { return; }
    location.reload();
  });
})();
