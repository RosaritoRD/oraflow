# Jeshua Divine Dawn

Identidad original de miniaturas para **Oraciones en Presencia de Jeshua**. El sistema parte del contenido del vídeo, propone una dirección visual y compone el texto mediante código sobre una ilustración o fotografía terminada sin letras.

Estado: planner, renderer, servicio, CLI e integración con Oraflow implementados y probados localmente. El diseñador guarda la portada terminada y producción la conserva sin volver a generarla. Las pruebas usan imágenes locales y proveedores simulados; no acreditan una generación en vivo ni un despliegue del laboratorio.

## Identidad y composición

| Elemento | Especificación |
| --- | --- |
| Lienzo | 1280 × 720 px, 16:9 |
| Margen seguro | 64 px alrededor de todo texto y contenido esencial |
| Navy | `#091A31` |
| Navy profundo | `#061020` |
| Oro | `#E9B75D` |
| Luz de amanecer | `#FFD783` |
| Marfil | `#FFF4DF` |
| Negro suave | `#080D14` |
| Tipografía | Barlow Condensed ExtraBold; respetar acentos y signos del idioma |
| Jerarquía | Máximo dos niveles: titular y apoyo opcional |
| Titular | 3–7 palabras en total, aunque ocupe varias líneas |

Mantener un sujeto principal claro, luz cálida y espacio negativo para el titular. El navy sostiene el contraste; marfil y oro organizan la lectura. Una miniatura nocturna conserva la paleta, pero reduce la luz y usa una atmósfera tranquila. Reservar la esquina inferior derecha para la duración de YouTube, sin palabras, rostros, manos u otros detalles esenciales.

El renderer debe colocar el texto exacto aprobado: la imagen generada nunca es responsable de escribirlo. El apoyo es opcional y no introduce un tercer nivel de lectura. No reducir la letra hasta volver ilegible un titular demasiado largo: reformularlo conservando el sentido.

La variedad puede cambiar encuadre, posición del sujeto, fondo, gesto y distribución de luz. Se mantienen paleta, tipografía, jerarquía y tratamiento devocional. El motivo puede ser una persona, silueta, Biblia, manos o luz según el tema; no se exige representar a Jeshua en cada imagen. Las referencias sirven para entender necesidades visuales, no para reproducir caras, composiciones, logotipos o miniaturas de otro canal. Un fondo degradado vacío no sustituye el artwork terminado.

## Seis temas

Los identificadores del planner son `morning`, `gratitude`, `anxiety`, `holy_spirit`, `protection` y `night`.

| Tema | Dirección visual | Ejemplo de titular ES |
| --- | --- | --- |
| `morning` | Amanecer dorado, apertura y esperanza | COMIENZA EL DÍA CON JESHUA |
| `gratitude` | Luz diurna cálida, gesto sereno y agradecido | GRACIAS POR UN NUEVO DÍA |
| `anxiety` | Calma y cercanía, fondo sencillo sin señales de amenaza | ENTREGA TU ANSIEDAD A JESHUA |
| `holy_spirit` | Luz envolvente, recogimiento y aire luminoso | ESPÍRITU SANTO GUÍA MIS PASOS |
| `protection` | Presencia firme y acogedora, sensación de refugio | JESHUA GUARDA MI HOGAR |
| `night` | Navy profundo, luz cálida tenue y descanso | DESCANSA EN LA PAZ DE JESHUA |

Son propuestas editoriales originales, no citas bíblicas ni promesas de resultados. El contenido real del vídeo determina cuál corresponde. `time_of_day` orienta la iluminación; no convierte automáticamente una oración de ansiedad en una de la mañana.

## Entrada

El archivo [de ejemplo](../examples/jeshua-thumbnail-input.json) permite preparar un plan sin red. El alcance inicial de idioma es explícitamente **ES/EN**, mediante `language: "es"` o `"en"`. No se da por implementada la traducción a otros idiomas.

| Campo JSON | Uso |
| --- | --- |
| `video_title` | Título completo del vídeo; no se copia entero en la miniatura |
| `video_topic` | Tema central que debe comunicar |
| `video_summary` | Resumen breve para elegir el enfoque |
| `script` | Guion o fragmento representativo; guía la coherencia editorial |
| `bible_verse` | Referencia bíblica y, solo cuando corresponda, texto autorizado |
| `prayer_type` | Uno de los seis identificadores anteriores |
| `emotion` | Emoción buscada, por ejemplo paz o gratitud |
| `time_of_day` | Momento del día, por ejemplo `dawn` o `night` |
| `language` | `es` o `en`; determina el idioma del texto visible |

No enviar claves API en este archivo. Utilizar textos, fotografías e ilustraciones propios o con licencia suficiente. Una referencia a un salmo no otorga derechos sobre cualquier traducción moderna ni sobre la grabación musical de otra persona.

## Flujo CLI

Desde la raíz de Oraflow, preparar el plan sin llamadas a proveedores:

```bash
npm run thumbnail:jeshua -- --input examples/jeshua-thumbnail-input.json --plan-only --out output/jeshua
```

Componer una vista para revisar usando una imagen propia o licenciada:

```bash
npm run thumbnail:jeshua -- --input examples/jeshua-thumbnail-input.json --artwork /ruta/imagen.jpg --variants 2 --out output/jeshua
```

La generación remota es una opción explícita y utiliza una API existente que esté configurada:

```bash
npm run thumbnail:jeshua -- --input examples/jeshua-thumbnail-input.json --generate --variants 2 --out output/jeshua
```

`--variants N` admite de 1 a 4 variantes. Revisar el coste del proveedor antes de ejecutar `--generate`; una suscripción de una aplicación no implica crédito o acceso incluido a su API. El coste depende también del número de variantes e intentos. `--plan-only` debe permanecer sin red y no generar cargos.

Después de inspeccionar el artwork elegido, registrar que una persona ha comprobado ausencia de letras, anatomía y coherencia visual:

```bash
npm run thumbnail:jeshua -- --input examples/jeshua-thumbnail-input.json --artwork /ruta/imagen-revisada.jpg --approve-artwork --out output/jeshua
```

`--approve-artwork` representa esa revisión humana; no es una garantía de OCR, detección de rostros o anatomía automática. Hay que revisar de nuevo si cambia la imagen. Ninguna de estas órdenes publica contenido.

La marca se activa mediante `THUMBNAIL_STYLE=jeshua-divine-dawn` o cuando `CHANNEL_NAME` corresponde a `Oraciones en Presencia de Jeshua`. Configurar esas opciones en el entorno autorizado; no modificar las credenciales ni reiniciar el laboratorio para probar este flujo.

El CLI guarda por defecto en `data/thumbnails/jeshua`; cada ejecución crea una carpeta distinta `jeshua-*` con `manifest.json` y subcarpetas por variante. La aplicación guarda en `uploads/thumbnails`. `THUMBNAIL_ARTWORK_PATH` permite usar una imagen local en el flujo automático; sin ella se usa el proveedor de imágenes existente. Un proveedor ausente o fallido produce un error, no una portada ficticia. El CLI lee las claves del entorno o del `.env` solamente con `--generate`; las credenciales guardadas del panel las recibe el agente integrado.

Cada variante generada solicita artwork diferente. Si se proporciona un único `--artwork`, las variantes reutilizan esa imagen y permiten comparar texto y composición. `--text-side left|right` fija el lado para una imagen local. Sin él, se compara el detalle visual de ambas columnas y se prefiere la más tranquila. Esto **no es detección de rostros**. Opcionalmente el brief admite `subject_region: {x,y,width,height}`, coordenadas entre 0 y 1 sobre el lienzo final de 16:9, para excluir esa zona del texto. En las imágenes generadas, esa zona procede del plan y debe comprobarse visualmente.

## Prompt maestro de artwork

Plantilla en inglés. Sustituir los campos entre llaves con el plan; el idioma de esta instrucción no determina el idioma del titular que añadirá el renderer.

```text
Create an original finished devotional artwork for a 16:9 YouTube thumbnail
for the channel "Oraciones en Presencia de Jeshua".

Theme: {prayer_type}. Video meaning: {video_summary}.
Intended emotion: {emotion}. Time of day: {time_of_day}.
Visual concept: {visual_concept}. Subject position: {subject_position}.
Keep {text_side} as quiet negative space for typography added later.

Use the single focal motif specified in the plan: {subject_description}.
For people, retain natural facial proportions, a calm authentic expression,
and simple ivory or navy clothing.
Use one clear focal subject, believable anatomy, and restrained detail.
When hands are visible, make them natural and anatomically plausible.
Build a coherent scene with depth and meaningful atmosphere.

Brand palette: navy #091A31, deep navy #061020, gold #E9B75D,
sunrise light #FFD783, ivory #FFF4DF, soft black #080D14.
Use warm directional light for daytime scenes. For night scenes, use deep
navy surroundings with gentle warm illumination and a restful atmosphere.
Preserve clarity when reduced to a small mobile thumbnail.

Keep important content inside a 64-pixel safe margin on a 1280x720 canvas.
Leave the lower-right duration overlay area free of essential details.
Create a fresh composition; do not recreate an existing thumbnail,
photograph, painting, actor likeness, logo, or another channel's identity.

Artwork only. Absolutely no text, letters, numbers, captions, signatures,
logos, symbols resembling writing, or watermarks anywhere in the image.
The headline and all branding text will be added programmatically later.
```

Negative prompt:

```text
text, letters, numbers, captions, typography, pseudo-writing, calligraphy,
logo, watermark, signature, copied composition, recognizable actor likeness,
deformed anatomy, extra fingers, fused fingers, extra limbs, distorted face,
misaligned eyes, duplicate main subject, cropped face, cropped essential hands,
cluttered background, busy text area, illegible visual hierarchy, harsh neon,
muddy contrast, excessive glow, overprocessed skin, horror, threatening imagery,
empty gradient placeholder, unfinished artwork, low-resolution artifacts
```

Las prohibiciones del prompt reducen errores, pero no verifican su ausencia. La revisión del resultado sigue siendo necesaria.

## Salidas y revisión

Artefactos por ejecución:

- **`manifest.json`:** lista de 1–4 variantes con rutas a sus archivos.
- **`variant-N/plan.json`:** entrada normalizada, idioma, tema, titular exacto, apoyo opcional, concepto, composición y prompts.
- **`thumbnail.jpg` y `thumbnail.png`:** 1280 × 720 con letras aplicadas mediante Sharp/Pango y fuente incluida bajo SIL OFL. El JPEG se mantiene por debajo de 2 MB.
- **`mobile-320.jpg` y `mobile-160.jpg`:** exportaciones reales para revisión móvil.
- **`qa.json`:** cajas del texto, tamaño de fuente, contraste mínimo muestreado (objetivo ≥4,5:1), margen de 64 px, zona reservada para duración, hash SHA-256 del artwork y avisos de recorte/resolución. El titular se ajusta entre 88 y 132 px; si no cabe, se rechaza con una solicitud de abreviarlo. No se elimina texto silenciosamente.

`automaticChecksPassed` no equivale a aprobación editorial: `requiresVisualReview` permanece activo. `artworkReview` registra `pending` o `operator-confirmed` si se usa `--approve-artwork` con una imagen local previamente inspeccionada; no se puede aprobar de antemano un artwork remoto que aún no existe. No hay OCR, detector de anatomía ni medidor semántico de legibilidad. Este informe acompaña al archivo, sin sustituir el proceso de revisión/publicación de Oraflow.

Antes de solicitar un artwork de pago, el servicio comprueba que el texto cabe con la fuente real. Si la propuesta de texto de IA no cabe, vuelve a la alternativa editorial local del mismo tema y registra el motivo; no paga una segunda imagen para resolver un problema tipográfico.

Checklist antes de aceptar una variante:

- A **320 px de ancho**: se entiende el tema, el titular tiene 3–7 palabras, el texto coincide exactamente con lo aprobado y la tipografía conserva acentos. Si hay apoyo, aporta información sin competir.
- A **160 px de ancho**: el titular y el sujeto principal siguen siendo reconocibles; el mensaje no depende de detalles pequeños ni de un apoyo ilegible.
- A resolución completa: texto dentro del margen de 64 px, esquina inferior derecha despejada, sin cortes importantes, sin desbordamientos y con contraste suficiente en toda el área de lectura. Verificar también las dimensiones y el tamaño del archivo de salida.
- Inspección humana: ausencia de texto residual en el artwork, manos y rostro plausibles, expresión adecuada, coherencia con el guion y diferencias reales entre variantes sin perder la marca.
- Procedencia confirmada: artwork y texto propios o licenciados; ningún elemento copiado de miniaturas de referencia. La aprobación final no se deduce únicamente de los controles automáticos.
