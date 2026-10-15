# Oraflow — guide for coding agents (Codex, Claude Code and others)

Oraflow is an AI agent that produces and publishes YouTube videos (long-form and Shorts) and shares them on Instagram and Facebook. Node.js 22, Express, SQLite, FFmpeg and Playwright. The dashboard and the API live in `index.js` (port 3456).

## Quick map
- `agents/`: the 7 pipeline agents (strategy → script → production → thumbnail → SEO → publishing → analytics).
- `utils/`: reusable pieces (voice, render, thumbnails, social, script rules…). Almost every change lands here.
- `schedules/daily-automation.js`: scheduled daily jobs.
- `dashboard/`: web dashboard (framework-free HTML/CSS/JS).
- `database/db.js`: SQLite (`data/youtube_automation.db`).
- `pc/taller/`: optional service to run FFmpeg renders on another PC.
- `tests/`: `node:test` tests, grouped by area.

## Commands
- Install: `npm ci`
- Tests (required before finishing): `npm test`
- Lint: `npm run lint`
- Run: `npm start` or `docker compose up -d`

## Rules
- **Secrets:** never write real keys, tokens or IDs in the code. Everything comes from `.env` (see `.env.example`). Don't read or print `.env`, `config/credentials.json` or `config/tokens.json`.
- **Tests first:** every behavior change comes with its test in `tests/<area>/`.
- **Small changes:** one topic per change; don't reformat files you aren't touching.
- **Language:** code comments and dashboard text are in Spanish; identifiers may be Spanish or English — follow the style of the file.
- **YouTube quota:** never call the YouTube API in loops or in tests; use the existing test doubles.

## Dashboard API
Every `/api/*` route requires the `x-api-key: $API_KEY` header. Useful ones: `GET /api/dashboard`, `GET /api/readiness`, `POST /api/ideas` (`{"topic": "..."}`), `POST /api/ideas/:id/generate`, `GET /api/jobs/:id`.

## More information
Full documentation: https://keizactech.com/docs
