// Formato de fechas, números y dinero en español.

import { formatES } from './dates.js';

const numberFormat = new Intl.NumberFormat('es-ES');
const moneyFormat = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export const fmtDate = (iso) => (iso ? formatES(iso) : '—');
export const fmtNumber = (n) => (n === null || n === undefined ? '—' : numberFormat.format(n));
export const fmtMoney = (n) => (n === null || n === undefined ? '—' : moneyFormat.format(n));
export const fmtHours = (n) => (n === null || n === undefined ? '—' : `${numberFormat.format(n)} h`);
export const fmtDateTime = (timestamp) => new Date(timestamp).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
