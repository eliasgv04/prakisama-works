// Fechas del aval: recepción de la obra + duración de la garantía → fin de la garantía calculado
// (migración 12). Compartido por los tres sitios donde se da de alta/edita un aval: la ficha de la
// obra, el alta de obra ("en preparación") y la ficha del banco.
//
// En la base de datos un trigger vuelve a calcular end_date con los mismos datos, así que lo que
// se manda aquí es solo para que el formulario enseñe la fecha al momento.

import { addPeriod } from '../lib/dates.js';
import { fmtDate, fmtMonths } from '../lib/format.js';
import { periodField, textField } from './components.js';
import { h } from './dom.js';

/**
 * - `existing`: el producto que se edita (o null).
 * - `receptionDefault`: fecha para precargar la recepción si el aval no tiene una (la del hito
 *   "Recepción de la obra", si ya está hecho).
 * - `manualEnd`: en la ficha del banco hay productos que no son avales (préstamos...) y necesitan
 *   poner la fecha de fin a mano; ahí se enseña ese campo y se bloquea cuando hay recepción + duración.
 */
export function avalDateFields(existing = null, { receptionDefault = '', manualEnd = false, endLabel = 'Fecha de finalización (opcional)', endHint = 'Si es un aval, mejor rellena la recepción y la duración y se calcula sola. Entra en el semáforo.' } = {}) {
  const months = existing?.guarantee_months ?? null;
  const inYears = months != null && months % 12 === 0;

  const reception = textField('Recepción de la obra', 'reception_date', {
    type: 'date',
    value: existing?.reception_date ?? (existing ? '' : receptionDefault),
    hint: 'La garantía del aval empieza a contar desde aquí.',
  });
  const duration = periodField('Duración del aval', { amount: months == null ? null : inYears ? months / 12 : months, unit: inYears ? 'year' : 'month', units: ['month', 'year'] });
  const receptionInput = reception.querySelector('input');

  // Avales antiguos con la fecha de fin puesta a mano (sin recepción ni duración): se respeta.
  const legacyEnd = existing && existing.reception_date == null && existing.guarantee_months == null ? existing.end_date : null;

  const computed = () => {
    const { amount, unit } = duration.read();
    if (!receptionInput.value || amount == null) return null;
    return addPeriod(receptionInput.value, amount, unit);
  };

  let endInput = null;
  let endField;
  if (manualEnd) {
    endField = textField(endLabel, 'end_date', { type: 'date', value: existing?.end_date ?? '', hint: endHint });
    endInput = endField.querySelector('input');
  } else {
    endField = h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Fin de la garantía (calculado)'), h('div', { class: 'strong' }));
  }

  const refresh = () => {
    const end = computed();
    if (endInput) {
      endInput.disabled = Boolean(end);
      if (end) endInput.value = end;
    } else {
      endField.lastChild.textContent = end ? fmtDate(end) : legacyEnd ? `${fmtDate(legacyEnd)} (puesta a mano)` : 'Pon la recepción y la duración';
    }
  };
  receptionInput.addEventListener('input', refresh);
  duration.onChange(refresh);
  refresh();

  return {
    nodes: [reception, duration, endField],
    /** Campos para bank_products: reception_date, guarantee_months, end_date. */
    read() {
      const { amount, unit } = duration.read();
      const guaranteeMonths = amount == null ? null : unit === 'year' ? amount * 12 : amount;
      const end = computed();
      return {
        reception_date: receptionInput.value || null,
        guarantee_months: guaranteeMonths,
        end_date: end ?? (endInput ? endInput.value || null : legacyEnd ?? null),
      };
    },
  };
}

/** "recepción 01/02/2026 · 5 años · garantía hasta 01/02/2031" (las partes que haya). */
export function avalDatesText(a) {
  return [
    a.reception_date ? `recepción ${fmtDate(a.reception_date)}` : null,
    a.guarantee_months != null ? fmtMonths(a.guarantee_months) : null,
    a.end_date ? `garantía hasta ${fmtDate(a.end_date)}` : null,
  ].filter(Boolean);
}
