// Cálculos de préstamos y leasing (funciones puras, sin DOM ni base de datos).
//
// Modelo: sistema francés (cuota mensual constante), el habitual en préstamos y leasing en España.
//   - Las cuotas se pagan cada mes, la primera un mes después de la constitución (el mismo día del
//     mes; si no existe, el último día, igual que addPeriod y que Postgres).
//   - Leasing: el valor residual (opción de compra) es un pago final aparte; las cuotas amortizan el
//     importe financiado menos ese residual (llevado a valor presente).
//   - Importes SIN IVA: en el leasing el IVA de cada cuota es aparte y se recupera, así que no se
//     mete en el coste.
// Si la persona escribe la cuota que le da el banco, se usa esa (puede diferir unos céntimos por
// redondeos o comisiones); si no, se calcula con el interés.

import { addPeriod, diffDays, todayISO } from './dates.js';
import { dueStatus } from './dueStatus.js';

export const PRODUCT_KINDS = {
  aval: { label: 'Aval', iconName: 'shield', hint: 'Garantía de una obra' },
  prestamo: { label: 'Préstamo', iconName: 'euro', hint: 'Cuota mensual con intereses' },
  leasing: { label: 'Leasing', iconName: 'truck', hint: 'Vehículo o maquinaria con opción de compra' },
  otro: { label: 'Otro', iconName: 'file', hint: 'Línea de crédito, póliza, confirming…' },
};

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Cuota mensual por el sistema francés.
 * @param {number} principal  importe financiado
 * @param {number} annualRate tipo nominal anual en % (p. ej. 4.5); 0 = sin intereses
 * @param {number} months     número de cuotas
 * @param {number} residual   valor residual que se paga al final (leasing); 0 en préstamos
 */
export function frenchPayment(principal, annualRate, months, residual = 0) {
  if (!(principal > 0) || !(months > 0) || annualRate == null || annualRate < 0) return null;
  const r = annualRate / 1200;
  if (r === 0) return round2((principal - residual) / months);
  const factor = (1 + r) ** months;
  return round2(((principal - residual / factor) * r) / (1 - 1 / factor));
}

/** Capital que queda por devolver después de `k` cuotas (sin contar el residual ya incluido). */
function outstandingPrincipal(principal, annualRate, payment, k) {
  const r = annualRate / 1200;
  if (r === 0) return Math.max(0, principal - payment * k);
  const growth = (1 + r) ** k;
  return Math.max(0, principal * growth - (payment * (growth - 1)) / r);
}

/** Cuántas cuotas se han pagado ya a fecha `today` (la primera, un mes después de `start`). */
export function paymentsMade(start, months, today = todayISO()) {
  if (!start || !(months > 0)) return 0;
  let k = 0;
  while (k < months && addPeriod(start, k + 1, 'month') <= today) k++;
  return k;
}

/**
 * Resumen completo de un préstamo o leasing para la ficha: cuota, totales, lo pagado, lo pendiente,
 * próxima cuota y progreso. Devuelve `null` si faltan los datos mínimos (importe y plazo).
 * Admite un objeto de bank_products o los valores del formulario (mismos nombres de campo).
 */
export function loanSummary(p, today = todayISO()) {
  const principal = p.amount == null ? null : Number(p.amount);
  const months = p.term_months == null ? null : Number(p.term_months);
  if (!(principal > 0) || !(months > 0)) return null;

  const rate = p.interest_rate == null ? null : Number(p.interest_rate);
  const residual = p.kind === 'leasing' && p.residual_value != null ? Number(p.residual_value) : 0;
  const computedPayment = rate == null ? null : frenchPayment(principal, rate, months, residual);
  const payment = p.monthly_payment != null ? Number(p.monthly_payment) : computedPayment;
  if (payment == null) return { principal, months, rate, residual, payment: null, computedPayment: null, incomplete: true };

  const totalPayments = round2(payment * months + residual);
  const interest = round2(totalPayments - principal);
  const endDate = p.start_date ? addPeriod(p.start_date, months, 'month') : null;
  const made = paymentsMade(p.start_date, months, today);
  const finished = Boolean(endDate) && endDate <= today;
  // El residual se paga con la última cuota: solo cuenta como pagado cuando ha terminado.
  const paid = round2(payment * made + (finished ? residual : 0));
  const remaining = round2(Math.max(0, totalPayments - paid));
  const capitalLeft = rate == null ? null : finished ? 0 : round2(outstandingPrincipal(principal, rate, payment, made));
  const nextPaymentDate = p.start_date && made < months ? addPeriod(p.start_date, made + 1, 'month') : null;

  return {
    principal,
    months,
    rate,
    residual,
    payment,
    computedPayment,
    paymentIsManual: p.monthly_payment != null && computedPayment != null && Math.abs(Number(p.monthly_payment) - computedPayment) >= 0.01,
    totalPayments,
    interest,
    endDate,
    made,
    left: months - made,
    paid,
    remaining,
    capitalLeft,
    nextPaymentDate,
    daysToNext: nextPaymentDate ? diffDays(today, nextPaymentDate) : null,
    started: Boolean(p.start_date) && p.start_date <= today,
    finished,
    progress: totalPayments > 0 ? Math.min(1, paid / totalPayments) : 0,
  };
}

/**
 * Semáforo de un producto bancario (panel, lista de bancos, ficha).
 *   - Aval: según el fin de la garantía, salvo que ya se haya pedido la devolución (está gestionado).
 *   - Otro: según su fecha de vencimiento, como siempre.
 *   - Préstamo y leasing: sin semáforo; que terminen no es un problema, es que están pagados.
 */
export function productDueStatus(p, today = todayISO()) {
  if (p.kind === 'prestamo' || p.kind === 'leasing') return null;
  if (p.kind === 'aval' && p.return_requested_date) return null;
  return dueStatus(p.end_date, undefined, today);
}

/** Nombre de la obra de un aval: la de la app o la escrita a mano. */
export const avalProjectName = (p) => p.project?.name ?? p.external_project ?? null;
