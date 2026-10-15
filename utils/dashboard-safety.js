// Solo ajustes que usa la interfaz. Lo nuevo queda privado por defecto;
// getAllSettings sigue disponible para los servicios internos.
const PUBLIC_SETTINGS = new Set([
  'approval_required', 'notification_enabled', 'channel_timezone', 'max_daily_posts',
  'content_buffer_days', 'daily_publish_time', 'daily_shorts_time', 'video_extras',
  'video_provider', 'video_generation_mode', 'video_clip_duration', 'video_max_generated_seconds'
]);

function dashboardSettings(settings = {}) {
  return Object.fromEntries(Object.entries(settings).filter(([key]) => PUBLIC_SETTINGS.has(key)));
}

function dashboardBoundary(req, res, next) {
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  let foreign = req.get('sec-fetch-site') === 'cross-site';
  if (origin) {
    try {
      const source = new URL(origin);
      const target = new URL(`${source.protocol}//${req.get('host')}`);
      foreign ||= !['http:', 'https:'].includes(source.protocol) || Boolean(source.username || source.password) || source.origin !== target.origin;
    } catch (_) { foreign = true; }
  }
  // Clientes internos sin Origin conservan su autenticación existente. El
  // proxy de Google sigue siendo la frontera de identidad del despliegue.
  if (foreign) return res.status(403).json({ success: false, error: 'Esta acción debe realizarse desde el panel del proyecto.' });
  return next();
}

module.exports = { dashboardSettings, dashboardBoundary };
