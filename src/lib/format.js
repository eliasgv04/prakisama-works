// Formato de fechas, números y dinero en español.

import { formatES } from './dates.js';

const numberFormat = new Intl.NumberFormat('es-ES');
const moneyFormat = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export const fmtDate = (iso) => (iso ? formatES(iso) : '—');
export const fmtNumber = (n) => (n === null || n === undefined ? '—' : numberFormat.format(n));
export const fmtMoney = (n) => (n === null || n === undefined ? '—' : moneyFormat.format(n));
export const fmtHours = (n) => (n === null || n === undefined ? '—' : `${numberFormat.format(n)} h`);
export const fmtDateTime = (timestamp) => new Date(timestamp).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

const PERIOD_UNITS = { day: ['día', 'días'], month: ['mes', 'meses'], year: ['año', 'años'] };
/** (3, 'month') → "3 meses" */
export const fmtPeriod = (amount, unit) => (amount == null || !PERIOD_UNITS[unit] ? '' : `${numberFormat.format(amount)} ${PERIOD_UNITS[unit][amount === 1 ? 0 : 1]}`);
/** Duración del aval guardada en meses → "5 años" si son años exactos, si no "18 meses". */
export const fmtMonths = (months) => (months == null ? '' : months % 12 === 0 ? fmtPeriod(months / 12, 'year') : fmtPeriod(months, 'month'));

/** Nombre de una certificación. Las creadas antes de la migración 17 no tienen: se usa la fecha. */
export const certName = (c) => c.name || `Certificación del ${fmtDate(c.cert_date)}`;
