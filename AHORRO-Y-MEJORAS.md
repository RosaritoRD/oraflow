# 💸 Ahorro y mejoras

Lo que hicimos para que Oraflow cueste poco al mes y lo que aprendimos para que los vídeos funcionen mejor. Todo está probado con un canal real que publica a diario.

---

## Parte 1 · Gastar menos

### 1. No pagar la voz de un vídeo que no se va a publicar
Antes de narrar, Oraflow comprueba si el título ya existe en el canal. Si se repite, se rehace el guion **antes** de gastar créditos de voz.
→ control de títulos repetidos en `index.js` y `database/db.js`.

### 2. Modelo de voz barato solo donde se nota menos
`ELEVENLABS_TTS_MODEL_SHORT=eleven_flash_v2_5` usa el modelo *flash* (más o menos la mitad de créditos) solo en los Shorts, y los largos siguen con `multilingual_v2`.
⚠️ **Mídelo antes de dejarlo fijo.** En nuestro canal la retención de los Shorts bajó cuando lo activamos, y lo estamos comprobando con una prueba de una semana. Ahorrar en voz no compensa si el vídeo se ve menos.

### 3. Vídeos largos más cortos
Pasar de 6–8 a **5–6 minutos** por vídeo largo recorta voz, render y almacenamiento sin cambiar el formato.
→ `DEFAULT_VIDEO_LENGTH=5-6 minutes`

### 4. Renderizar en tu PC, no en el servidor
El FFmpeg pesado puede hacerse en un ordenador de casa (el "taller"). Si el PC no responde, el servidor lo hace solo. Así basta con un VPS pequeño y barato.
→ `pc/taller/` y `FFMPEG_REMOTO_URL`

### 5. IA local para las tareas repetitivas
El análisis de comentarios usa **qwen3:8b con Ollama** en tu PC, y solo recurre a la nube si el PC está apagado. Los guiones siguen en la nube, que es donde se nota la calidad.
→ `LOCAL_LLM_URL`, `LOCAL_LLM_MODEL`

### 6. Voz local gratuita *(pendiente de conectar)*
Hay un cliente para voz local con Kokoro o Piper (`utils/local-tts-client.js`). Ya funciona en pruebas, pero **todavía no está enganchado** a la producción. Ver `docs/local-voice.md`.

### 7. Imágenes y vídeo sin pagar por cada uno
- `VIDEO_PROVIDER=slideshow`: paisajes y fotos con movimiento en lugar de vídeo generado por IA, que es lo más caro.
- Fondos de **Pexels** (gratis con clave) y colección propia que rota (`utils/background-picker.js`).
- `THUMBNAIL_AI=off`: miniaturas con plantillas y biblioteca propia; la IA de imagen solo se usa si la activas.
- `IMAGE_QUALITY=medium` cuando sí se usa IA de imagen.

### 8. No rehacer lo que ya está hecho
- **Caché de planos:** cambiar una escena ya no vuelve a renderizar el vídeo entero.
- **Caché de narración:** el mismo texto con la misma voz no se paga dos veces.
- **Biblioteca de clips** reutilizables, con limpieza diaria del disco.

### 9. Proteger la cuota gratuita de YouTube
La API de YouTube tiene un límite diario. Oraflow reserva cuota para las subidas, desactiva las respuestas automáticas en YouTube hasta que las enciendas y avisa cuando la cuota se agota, en lugar de fallar en silencio.

---

## Parte 2 · Que funcione mejor

### 1. La métrica que manda en Shorts es la retención
Las vistas de un Short dependen de cuánta gente lo ve entero, o más de una vez. Oraflow guarda la retención a 24 h y a 7 días de cada vídeo. **Mírala antes de cambiar cualquier cosa.** En nuestro canal, los Shorts que superaban el 130 % de retención sacaron entre 2 y 3 veces más vistas.

### 2. Títulos que nombran una situación, no un tema
Funcionan mejor *"Oración de la noche cuando no puedes dejar de pensar"* o *"Si despertaste con ansiedad, haz esta oración"* que *"Oración de la mañana para paz y esperanza"*. El guionista ya aprende de tus Shorts con más vistas (`utils/shorts-que-funcionan.js`).

### 3. El primer segundo es una imagen, no un problema
*"Si apagas la luz y tus preocupaciones siguen despiertas…"* engancha más que empezar con *"Si el trabajo y las cuentas…"*.

### 4. Pide una sola cosa al final
"Escribe *Amén* en los comentarios" es corto y directo. Los vídeos que lo pedían tuvieron decenas de comentarios, y los que no, casi ninguno. Configúralo en el perfil del canal (panel → Canal → llamada a la acción).

### 5. Sin fechas en los títulos de vídeos largos
"ORACIÓN DE LA MAÑANA · 15 DE OCTUBRE" parece caducado al día siguiente. Usa `TITLE_DATE=off`.

### 6. Cambia una sola cosa cada vez
Si cambias la voz, la miniatura y el título a la vez, no sabrás cuál funcionó. Haz pruebas de una semana con un solo cambio y compara con la semana anterior. El *Growth Experiments Studio* del panel hace esto con títulos y miniaturas.

---

¿Tienes otro truco para ahorrar o mejorar? Abre un issue o un PR.
📖 Más guías en **[keizactech.com/docs](https://keizactech.com/docs)**
