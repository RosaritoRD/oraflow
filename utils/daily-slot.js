/**
 * Daily publishing slot: one long video a day at a fixed local time (04:00 New
 * York by default). All in pure functions so the clock change can be tested
 * without touching the system clock.
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

/** Date/time parts as seen in the `timeZone` zone. */
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

/** The UTC instant matching year-month-day hour:minute in `timeZone`. */
function zonedToUtc({ year, month, day, hour, minute }, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes: the second fixes the case where the first lands on the other side of the clock change.
  let utc = guess;
  for (let i = 0; i < 2; i++) {
    const seen = localParts(new Date(utc), timeZone);
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
    utc += guess - seenAsUtc;
  }
  return new Date(utc);
}

/**
 * Next free daily slot, with at least `minLeadMinutes` of margin.
 * `taken` = times (ISO) that already have a video assigned.
 */
function nextDailySlot({ now = new Date(), timeZone = DEFAULT_TZ, clock = DEFAULT_CLOCK, minLeadMinutes = 20, taken = [] } = {}) {
  const { hour, minute } = parseClock(clock) || parseClock(DEFAULT_CLOCK);
  const takenKeys = new Set(taken.filter(Boolean).map(t => localDateKey(new Date(t), timeZone)));
  const earliest = now.getTime() + minLeadMinutes * 60000;
  const today = localParts(now, timeZone);
  for (let offset = 0; offset < 400; offset++) {
    // Noon UTC of the local day + offset: avoids odd jumps when adding days.
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
 * Several slots a day (29/09/2026): "04:00,18:30" = morning and evening. Returns
 * the valid times sorted; if none is left, the `fallback` one.
 */
function parseClocks(value, fallback = DEFAULT_CLOCK) {
  const clocks = String(value || '').split(',').map(v => v.trim()).filter(v => parseClock(v));
  const unique = [...new Set(clocks.map(v => {
    const { hour, minute } = parseClock(v);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }))].sort();
  return unique.length ? unique : parseClocks(fallback, DEFAULT_CLOCK);
}

/** MORNING before 12, AFTERNOON until 18, NIGHT after (18:30 → NIGHT). */
function franjaDeHora(clock) {
  const { hour } = parseClock(clock) || parseClock(DEFAULT_CLOCK);
  if (hour < 12) return 'MAÑANA';
  if (hour < 18) return 'TARDE';
  return 'NOCHE';
}

/**
 * Next free slot among several times a day. An already scheduled video takes the
 * nearest slot on its same local day (that way a manual video at 10:33 counts as
 * the morning one and two don't go out back to back).
 * → { publishTime (ISO), clock, franja }
 */
function nextFreeSlot({ now = new Date(), timeZone = DEFAULT_TZ, clocks = [DEFAULT_CLOCK], minLeadMinutes = 20, taken = [] } = {}) {
  const list = parseClocks(Array.isArray(clocks) ? clocks.join(',') : clocks);
  const parsed = list.map(parseClock);
  const minuteOfDay = ({ hour, minute }) => hour * 60 + minute;
  // The slot taken by an already scheduled time: the one on its day with the closest time.
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
 * How to upload a video with a daily slot: always private with publishAt, so
 * YouTube makes it public at the exact time even if the VPS is off.
 * If the slot has already passed, it goes out in 10 minutes instead of staying
 * private.
 */
function uploadPlan({ publishTime, now = new Date(), graceMinutes = 10 }) {
  const target = new Date(publishTime).getTime();
  const soonest = now.getTime() + graceMinutes * 60000;
  const publishAt = new Date(target > now.getTime() + 2 * 60000 ? target : soonest).toISOString();
  return { privacyStatus: 'private', publishAt };
}

/**
 * The date the title and thumbnail must carry: the day the video goes public,
 * not the day it's generated (tomorrow's is generated at 06:00).
 * DAILY_PUBLISH=off goes back to "today".
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
 * Publish date of ONE job: the slot the scheduler assigned to it (morning
 * 04:00, evening 18:30…) or, if it doesn't carry one, the next daily slot.
 */
function fechaDelEncargo(strategy = null, now = new Date(), env = process.env) {
  const slot = strategy?.publishSlot ? new Date(strategy.publishSlot) : null;
  return slot && !Number.isNaN(slot.getTime()) ? slot : fechaDePublicacion(now, env);
}

/**
 * Validates what's saved to daily_publish_time / daily_shorts_time from the
 * API: "off" or 1 to 6 HH:MM times separated by commas. Returns the normalized
 * value (sorted, no duplicates) or throws a readable error.
 */
function validaHoras(valor) {
  const crudo = String(valor ?? '').trim();
  if (crudo.toLowerCase() === 'off') return 'off';
  const partes = crudo.split(',').map(v => v.trim()).filter(Boolean);
  if (!partes.length || partes.some(v => !parseClock(v))) {
    throw new Error('Times must be "off" or HH:MM separated by commas (for example 05:00,12:00,19:00)');
  }
  const horas = parseClocks(partes.join(','));
  if (horas.length > 6) throw new Error('At most 6 times a day');
  return horas.join(',');
}

module.exports = { validaHoras, fechaDelEncargo, nextFreeSlot, parseClocks, franjaDeHora, nextDailySlot, localDateKey, parseClock, uploadPlan, zonedToUtc, fechaDePublicacion, DEFAULT_TZ, DEFAULT_CLOCK };
