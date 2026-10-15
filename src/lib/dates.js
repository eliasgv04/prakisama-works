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

/**
 * Suma `amount` días, meses o años (`unit`: 'day' | 'month' | 'year') a una fecha ISO. Si el día
 * no existe en el mes de destino se queda en el último (31/01 + 1 mes = 28/02), igual que
 * Postgres al sumar un interval: así lo que se ve en el formulario cuadra con lo que se guarda.
 */
export function addPeriod(iso, amount, unit) {
  const p = parseISO(iso);
  const n = Number(amount);
  if (!p || !Number.isInteger(n)) return null;
  if (unit === 'day') {
    const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  const months = unit === 'year' ? n * 12 : n;
  const total = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${pad(y, 4)}-${pad(m)}-${pad(Math.min(p.d, daysInMonth(y, m)))}`;
}
