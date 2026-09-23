// Aritmética mínima de fechas "de calendario" sobre cadenas ISO (YYYY-MM-DD), en UTC para no
// arrastrar errores de zona horaria. Copiado de Prakisama Mobility (supabase/functions/_shared/dates.js).

const TIMEZONE = 'Europe/Madrid';
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year, month /* 1-12 */) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Devuelve {y, m, d} o null si la cadena no es una fecha de calendario válida. */
export function parseISO(iso) {
  const match = typeof iso === 'string' ? ISO_RE.exec(iso) : null;
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

const pad = (n, width = 2) => String(n).padStart(width, '0');

/** Días naturales de `fromIso` a `toIso` (positivo si `toIso` es posterior). */
export function diffDays(fromIso, toIso) {
  const a = parseISO(fromIso);
  const b = parseISO(toIso);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria indicada. `now` se puede inyectar en pruebas manuales. */
export function todayISO(tz = TIMEZONE, now = new Date()) {
  // El locale en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** 2026-09-21 → 21/09/2026 */
export function formatES(iso) {
  const p = parseISO(iso);
  return p ? `${pad(p.d)}/${pad(p.m)}/${pad(p.y, 4)}` : '';
}
