/**
 * Hueco diario de publicación: un vídeo largo por día a una hora local fija
 * (por defecto 04:00 de Nueva York). Todo en funciones puras para poder
 * probar el cambio de hora sin tocar el reloj del sistema.
 */

const DEFAULT_TZ = 'America/New_York';
const DEFAULT_CLOCK = '04:00';

function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** Partes de la fecha/hora tal como se ven en la zona `timeZone`. */
function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date);
  const get = type => Number(parts.find(p => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

function localDateKey(date, timeZone = DEFAULT_TZ) {
  const { year, month, day } = localParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Instante UTC que corresponde a year-month-day hour:minute en `timeZone`. */
function zonedToUtc({ year, month, day, hour, minute }, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Dos pasadas: la segunda corrige el caso en que la primera cae al otro lado del cambio de hora.
  let utc = guess;
  for (let i = 0; i < 2; i++) {
    const seen = localParts(new Date(utc), timeZone);
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
    utc += guess - seenAsUtc;
  }
  return new Date(utc);
}

/**
 * Próximo hueco diario libre, con al menos `minLeadMinutes` de margen.
 * `taken` = horas (ISO) que ya tienen un vídeo asignado.
 */
function nextDailySlot({ now = new Date(), timeZone = DEFAULT_TZ, clock = DEFAULT_CLOCK, minLeadMinutes = 20, taken = [] } = {}) {
  const { hour, minute } = parseClock(clock) || parseClock(DEFAULT_CLOCK);
  const takenKeys = new Set(taken.filter(Boolean).map(t => localDateKey(new Date(t), timeZone)));
  const earliest = now.getTime() + minLeadMinutes * 60000;
  const today = localParts(now, timeZone);
  for (let offset = 0; offset < 400; offset++) {
    // Mediodía UTC del día local + offset: evita saltos raros al sumar días.
    const base = new Date(Date.UTC(today.year, today.month - 1, today.day + offset, 12));
    const slot = zonedToUtc({
      year: base.getUTCFullYear(), month: base.getUTCMonth() + 1, day: base.getUTCDate(), hour, minute
    }, timeZone);
    if (slot.getTime() < earliest) continue;
    if (takenKeys.has(localDateKey(slot, timeZone))) continue;
    return slot.toISOString();
  }
  throw new Error('No free daily publishing slot found');
}

/**
 * Varios huecos al día (29/09/2026): "04:00,18:30" = mañana y noche. Devuelve
 * las horas válidas ordenadas; si no queda ninguna, la de `fallback`.
 */
function parseClocks(value, fallback = DEFAULT_CLOCK) {
  const clocks = String(value || '').split(',').map(v => v.trim()).filter(v => parseClock(v));
  const unique = [...new Set(clocks.map(v => {
    const { hour, minute } = parseClock(v);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }))].sort();
  return unique.length ? unique : parseClocks(fallback, DEFAULT_CLOCK);
}

/** MAÑANA antes de las 12, TARDE hasta las 18, NOCHE después (18:30 → NOCHE). */
function franjaDeHora(clock) {
  const { hour } = parseClock(clock) || parseClock(DEFAULT_CLOCK);
  if (hour < 12) return 'MAÑANA';
  if (hour < 18) return 'TARDE';
  return 'NOCHE';
}

/**
 * Próximo hueco libre entre varias horas al día. Un vídeo ya programado ocupa
 * el hueco más cercano de su mismo día local (así un vídeo manual a las 10:33
 * cuenta como el de la mañana y no se publican dos seguidos).
 * → { publishTime (ISO), clock, franja }
 */
function nextFreeSlot({ now = new Date(), timeZone = DEFAULT_TZ, clocks = [DEFAULT_CLOCK], minLeadMinutes = 20, taken = [] } = {}) {
  const list = parseClocks(Array.isArray(clocks) ? clocks.join(',') : clocks);
  const parsed = list.map(parseClock);
  const minuteOfDay = ({ hour, minute }) => hour * 60 + minute;
  // Hueco que ocupa una hora ya programada: el de su día con la hora más cercana.
  const occupied = new Set(taken.filter(Boolean).map(t => {
    const when = new Date(t);
    const local = localParts(when, timeZone);
    const m = local.hour * 60 + local.minute;
    let best = 0;
    parsed.forEach((c, i) => { if (Math.abs(minuteOfDay(c) - m) < Math.abs(minuteOfDay(parsed[best]) - m)) best = i; });
    return `${localDateKey(when, timeZone)} ${list[best]}`;
  }));
  const earliest = now.getTime() + minLeadMinutes * 60000;
  const today = localParts(now, timeZone);
  for (let offset = 0; offset < 400; offset++) {
    const base = new Date(Date.UTC(today.year, today.month - 1, today.day + offset, 12));
    for (let i = 0; i < list.length; i++) {
      const slot = zonedToUtc({
        year: base.getUTCFullYear(), month: base.getUTCMonth() + 1, day: base.getUTCDate(), ...parsed[i]
      }, timeZone);
      if (slot.getTime() < earliest) continue;
      if (occupied.has(`${localDateKey(slot, timeZone)} ${list[i]}`)) continue;
      return { publishTime: slot.toISOString(), clock: list[i], franja: franjaDeHora(list[i]) };
    }
  }
  throw new Error('No free daily publishing slot found');
}

/**
 * Cómo subir un vídeo con hueco diario: siempre privado con publishAt, para
 * que YouTube lo haga público a la hora exacta aunque la VPS esté apagada.
 * Si el hueco ya pasó, sale a los 10 minutos en vez de quedarse privado.
 */
function uploadPlan({ publishTime, now = new Date(), graceMinutes = 10 }) {
  const target = new Date(publishTime).getTime();
  const soonest = now.getTime() + graceMinutes * 60000;
  const publishAt = new Date(target > now.getTime() + 2 * 60000 ? target : soonest).toISOString();
  return { privacyStatus: 'private', publishAt };
}

/**
 * Fecha que debe llevar el título y la miniatura: la del día en que el vídeo
 * se hace público, no la del día en que se genera (a las 06:00 se genera el
 * de mañana). DAILY_PUBLISH=off vuelve a "hoy".
 */
function fechaDePublicacion(now = new Date(), env = process.env) {
  if (String(env.DAILY_PUBLISH || '').toLowerCase() === 'off') return now;
  return new Date(nextFreeSlot({
    now,
    timeZone: env.CHANNEL_TIMEZONE || DEFAULT_TZ,
    clocks: parseClocks(env.DAILY_PUBLISH_TIME || DEFAULT_CLOCK)
  }).publishTime);
}

/**
 * Fecha de publicación de UN encargo: el hueco que le asignó el programador
 * (mañana 04:00, noche 18:30…) o, si no lo trae, el próximo hueco diario.
 */
function fechaDelEncargo(strategy = null, now = new Date(), env = process.env) {
  const slot = strategy?.publishSlot ? new Date(strategy.publishSlot) : null;
  return slot && !Number.isNaN(slot.getTime()) ? slot : fechaDePublicacion(now, env);
}

/**
 * Valida lo que se guarda en daily_publish_time / daily_shorts_time desde la
 * API: "off" o de 1 a 6 horas HH:MM separadas por comas. Devuelve el valor
 * normalizado (ordenado, sin repetidas) o lanza un error legible.
 */
function validaHoras(valor) {
  const crudo = String(valor ?? '').trim();
  if (crudo.toLowerCase() === 'off') return 'off';
  const partes = crudo.split(',').map(v => v.trim()).filter(Boolean);
  if (!partes.length || partes.some(v => !parseClock(v))) {
    throw new Error('Las horas deben ser "off" o HH:MM separadas por comas (por ejemplo 05:00,12:00,19:00)');
  }
  const horas = parseClocks(partes.join(','));
  if (horas.length > 6) throw new Error('Como mucho 6 horas al día');
  return horas.join(',');
}

module.exports = { validaHoras, fechaDelEncargo, nextFreeSlot, parseClocks, franjaDeHora, nextDailySlot, localDateKey, parseClock, uploadPlan, zonedToUtc, fechaDePublicacion, DEFAULT_TZ, DEFAULT_CLOCK };
