// Semáforo genérico para cualquier fecha de vencimiento de la app (reconocimiento médico,
// productos bancarios...): sin motor de avisos por email, solo visual. Misma antelación fija para
// todos (30 días), sin pantalla de ajustes.

import { diffDays, todayISO } from './dates.js';

export const DEFAULT_LEAD_DAYS = 30;

/** @returns {'ok'|'soon'|'overdue'|null} null = sin fecha (no se puede calcular) */
export function dueStatus(date, leadDays = DEFAULT_LEAD_DAYS, today = todayISO()) {
  if (!date) return null;
  const days = diffDays(today, date);
  if (days < 0) return 'overdue';
  if (days <= leadDays) return 'soon';
  return 'ok';
}

const RANK = { overdue: 0, soon: 1, ok: 2 };
/** El peor de varios estados (algunos pueden ser null, se ignoran). */
export function worstDueStatus(statuses) {
  let worst = null;
  for (const s of statuses) {
    if (!s) continue;
    if (worst === null || RANK[s] < RANK[worst]) worst = s;
  }
  return worst;
}
