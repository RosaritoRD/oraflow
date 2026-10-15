# Oraflow — guía para agentes de código (Codex, Claude Code y otros)

Oraflow es un agente de IA que produce y publica vídeos de YouTube (largos y Shorts) y los comparte en Instagram y Facebook. Node.js 22, Express, SQLite, FFmpeg y Playwright. El panel y la API viven en `index.js` (puerto 3456).

## Mapa rápido
- `agents/`: los 7 agentes del flujo (estrategia → guion → producción → miniatura → SEO → publicación → analítica).
- `utils/`: piezas reutilizables (voz, render, miniaturas, redes, reglas del guion…). Casi todo cambio cae aquí.
- `schedules/daily-automation.js`: tareas diarias programadas.
- `dashboard/`: panel web (HTML/CSS/JS sin framework).
- `database/db.js`: SQLite (`data/youtube_automation.db`).
- `pc/taller/`: servicio opcional para renderizar FFmpeg en otro PC.
- `tests/`: tests con `node:test`, agrupados por área.

## Comandos
- Instalar: `npm ci`
- Tests (obligatorio antes de terminar): `npm test`
- Lint: `npm run lint`
- Arrancar: `npm start` o `docker compose up -d`

## Reglas
- **Secretos:** nunca escribas claves, tokens ni IDs reales en el código. Todo sale de `.env` (ver `.env.example`). No leas ni muestres `.env`, `config/credentials.json` ni `config/tokens.json`.
- **Tests primero:** cada cambio de comportamiento lleva su test en `tests/<área>/`.
- **Cambios pequeños:** un tema por cambio; no reformatees archivos que no tocas.
- **Idioma:** comentarios y textos del panel en español; el código (nombres) puede ser español o inglés, sigue el estilo del archivo.
- **Cuota de YouTube:** no hagas llamadas a la API de YouTube en bucles ni en tests; usa los dobles de prueba existentes.

## API del panel
Todas las rutas `/api/*` piden la cabecera `x-api-key: $API_KEY`. Útiles: `GET /api/dashboard`, `GET /api/readiness`, `POST /api/ideas` (`{"topic": "..."}`), `POST /api/ideas/:id/generate`, `GET /api/jobs/:id`.

## Más información
Documentación completa: https://keizactech.com/docs
