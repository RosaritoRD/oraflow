#!/usr/bin/env node
// Despliegue automático de Oraflow (panel.tu-dominio.com). Lo lanza cada
// minuto el timer de systemd oraflow-autodeploy.timer (unidades en esta
// misma carpeta). La decisión vive en core.js (probada en tests/autodeploy/).
//
// Orden: ¿hay commit nuevo sin desplegar? → pruebas (sin fallos NUEVOS) →
// guardar la imagen actual como :previo → build + up → /health. Si la nueva no
// arranca sana, vuelve sola a :previo. Avisa por correo solo cuando algo falla.
//   node scripts/autodeploy/run.mjs            normal
//   node scripts/autodeploy/run.mjs --dry-run  dice qué haría
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { decide, fallosNuevos, debeAvisar } = require('./core.js');

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..');
const LAB = path.resolve(REPO, '..', 'oraflow-lab');
const IMAGEN = 'oraflow-lab-oraflow';
const API = process.env.ORAFLOW_URL || 'http://127.0.0.1:3456';
const ESTADO = process.env.ORAFLOW_AUTODEPLOY_STATE || '/var/lib/oraflow-autodeploy.json';
// El correo sale con la misma configuración SMTP que el vigilante de la VPS.
const KEIZAC = '/opt/keizac-web';
const SECO = process.argv.includes('--dry-run');

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const git = (...a) => sh('git', a, { cwd: REPO });

const leeEstado = async () => { try { return JSON.parse(await fsp.readFile(ESTADO, 'utf8')); } catch { return {}; } };
async function guardaEstado(e) {
  if (SECO) return;
  await fsp.mkdir(path.dirname(ESTADO), { recursive: true });
  await fsp.writeFile(ESTADO, JSON.stringify(e, null, 2));
}

async function correo(asunto, cuerpo) {
  log('AVISO:', asunto);
  if (SECO) return true;
  try {
    const { enviaCorreo } = await import(path.join(KEIZAC, 'tools', 'smtp-min.mjs'));
    const cfg = {};
    for (const l of (await fsp.readFile(path.join(KEIZAC, 'api', '.env'), 'utf8')).split('\n')) {
      const m = l.match(/^(SMTP_HOST|SMTP_PORT|SMTP_SECURE|SMTP_USER|SMTP_PASS|SMTP_FROM|NOTIFY_EMAIL|OWNER_EMAILS)=(.*)$/);
      if (m) cfg[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
    const to = cfg.NOTIFY_EMAIL || cfg.OWNER_EMAILS;
    if (!cfg.SMTP_HOST || !to) { console.error('sin SMTP configurado: aviso NO enviado'); return false; }
    await enviaCorreo({
      host: cfg.SMTP_HOST, port: Number(cfg.SMTP_PORT || 465), secure: String(cfg.SMTP_SECURE || 'true') !== 'false',
      user: cfg.SMTP_USER, pass: cfg.SMTP_PASS, from: cfg.SMTP_FROM || cfg.SMTP_USER,
      to, subject: `[Oraflow deploy] ${asunto}`, text: `${cuerpo}\n\nRegistro: /var/log/oraflow-autodeploy.log en la VPS.\n`
    });
    return true;
  } catch (e) {
    console.error('el correo falló:', e.message);
    return false;
  }
}

// Anota el problema en curso (o ninguno), avisa si toca y guarda.
async function cierra(estado, problema, asunto, cuerpo) {
  const ahora = Date.now();
  if (!problema) Object.assign(estado, { ultimo: null, desde: null, avisado: false });
  else {
    if (estado.ultimo !== problema) Object.assign(estado, { ultimo: problema, desde: ahora, avisado: false });
    if (debeAvisar(estado, problema, ahora) && await correo(asunto, cuerpo)) estado.avisado = true;
  }
  await guardaEstado(estado);
}

async function json(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null; } catch { return null; }
}

// Renders en marcha: generación de videos + trabajo del estudio de Shorts.
async function trabajosActivos() {
  const [dash, job] = await Promise.all([json(`${API}/api/dashboard`), json(`${API}/api/shorts/job`)]);
  const videos = Number(dash?.result?.system?.activeJobs ?? dash?.system?.activeJobs ?? 0);
  const shorts = job?.result?.status === 'running' ? 1 : 0;
  return videos + shorts;
}

function discoLibreGB() {
  const s = fs.statfsSync('/');
  return (s.bavail * s.bsize) / 1024 ** 3;
}

function pruebas() {
  let salida = '';
  try {
    salida = sh('node', ['test.js'], { cwd: REPO, timeout: 15 * 60 * 1000 });
  } catch (e) {
    salida = `${e.stdout || ''}\n${e.stderr || ''}`; // test.js sale con 1 si algo falla, también los conocidos
  }
  const fallidos = [...salida.matchAll(/❌ (.+?) - FAILED/g)].map(m => m[1]);
  const conocidos = fs.readFileSync(path.join(AQUI, 'fallos-conocidos.txt'), 'utf8')
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const ejecutadas = /Total: (\d+)/.exec(salida);
  if (!ejecutadas) return { ok: false, detalle: 'test.js no llegó al resumen:\n' + salida.slice(-1500) };
  const nuevos = fallosNuevos(fallidos, conocidos);
  return nuevos.length ? { ok: false, detalle: `Fallan de nuevo:\n- ${nuevos.join('\n- ')}` } : { ok: true };
}

async function sano() {
  for (let i = 0; i < 24; i += 1) {
    await new Promise(r => setTimeout(r, 5000));
    const h = await json(`${API}/health`);
    if (h && h.status === 'healthy') return true;
  }
  return false;
}

async function principal() {
  const estado = await leeEstado();
  const head = git('rev-parse', 'HEAD');
  const corto = head.slice(0, 7);
  const d = decide({
    head,
    desplegado: estado.desplegado || null,
    dirty: git('status', '--porcelain', '--untracked-files=no') !== '',
    trabajosActivos: await trabajosActivos(),
    discoLibreGB: discoLibreGB()
  });

  if (d.accion === 'nada') return cierra(estado, null);
  if (d.accion === 'adoptar') {
    log(`sin estado previo: se adopta ${corto} como desplegado`);
    estado.desplegado = head;
    return cierra(estado, null);
  }
  if (d.accion === 'esperar') { log(`${corto} pendiente: hay un render en marcha, se espera`); return; }
  if (d.accion === 'saltar') {
    const textos = {
      'cambios-locales': ['hay cambios sin commitear en Oraflow', `El commit ${corto} no está desplegado y el repo tiene cambios sin commitear: la imagen los copiaría. Commitea o descarta y se desplegará solo.`],
      'poco-disco': ['poco disco: no se construye', `Quedan ${discoLibreGB().toFixed(1)} GB libres; hacen falta 4. Libera espacio (docker builder prune -f, docker image prune -f) y se desplegará solo.`]
    }[d.motivo];
    log('saltado:', d.motivo);
    return cierra(estado, `${d.motivo}@${corto}`, textos[0], textos[1]);
  }

  log(`${corto} sin desplegar — pruebas`);
  if (SECO) { log('--dry-run: aquí se probaría y desplegaría'); return; }
  if (estado.probadoMal === head) return cierra(estado, `tests-fallan@${corto}`);
  const p = pruebas();
  if (!p.ok) {
    estado.probadoMal = head;
    return cierra(estado, `tests-fallan@${corto}`, `pruebas en rojo en ${corto}: no se desplegó`, `El panel sigue con la versión anterior.\n\n${p.detalle}`);
  }
  try {
    sh('docker', ['tag', `${IMAGEN}:latest`, `${IMAGEN}:previo`]);
    log('construyendo');
    sh('docker', ['compose', 'build', 'oraflow'], { cwd: LAB, timeout: 30 * 60 * 1000 });
    sh('docker', ['compose', 'up', '-d', 'oraflow'], { cwd: LAB, timeout: 5 * 60 * 1000 });
  } catch (e) {
    return cierra(estado, `build-falla@${corto}`, `falló el build de ${corto}`, String(e.stderr || e.message).slice(-1500));
  }
  if (!(await sano())) {
    log('la imagen nueva no arranca sana: vuelta a :previo');
    try {
      sh('docker', ['tag', `${IMAGEN}:previo`, `${IMAGEN}:latest`]);
      sh('docker', ['compose', 'up', '-d', 'oraflow'], { cwd: LAB, timeout: 5 * 60 * 1000 });
    } catch (e) { log('la vuelta atrás también falló:', e.message); }
    estado.probadoMal = head;
    return cierra(estado, `no-arranca@${corto}`, `${corto} no arrancó sano: se volvió a la versión anterior`,
      `/health no respondió "healthy" en 2 minutos. Logs: docker logs oraflow-lab`);
  }
  try { sh('docker', ['image', 'prune', '-f']); } catch { /* opcional */ }
  estado.desplegado = head;
  delete estado.probadoMal;
  log(`desplegado ${corto}`);
  return cierra(estado, null);
}

principal().catch(e => { console.error(new Date().toISOString(), 'error inesperado', e); process.exitCode = 1; });
