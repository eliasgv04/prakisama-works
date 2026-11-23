// Piezas comunes de las fichas (obra, trabajador, banco). Mismo sistema que la ficha del vehículo
// de Prakisama Mobility: todas las tarjetas siguen el mismo esquema y solo usan cuatro tamaños de letra
//   título (etiqueta granate) + estado · dato grande · texto gris · contenido · pie con botones iguales
// Las tarjetas van en una cuadrícula POR FILAS (`.detail-grid`): las de una misma fila miden lo mismo
// y sus botones quedan alineados abajo. `.full` ocupa toda la fila.

import { button, icon } from './components.js';
import { confirmDialog, h, toast } from './dom.js';
import { friendlyError } from '../lib/errors.js';

/** Tarjeta con su título dentro y, opcionalmente, el estado a la derecha del título. */
export const panel = (title, chip, ...content) =>
  h('div', { class: 'card panel' }, h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, title), chip ?? null), ...content);

/** Dato principal (fecha, importe…). Sin dato se muestra en gris en el mismo sitio, para que la tarjeta no cambie de forma. */
export const panelValue = (value, missing) => h('div', { class: `panel-value${value ? '' : ' missing'}` }, value || missing);

/** Texto secundario, siempre del mismo tamaño. */
export const panelText = (...content) => h('p', { class: 'panel-text' }, ...content);

/** Pie de tarjeta: los botones se reparten el ancho a partes iguales. Siempre devuelve un nodo. */
export const cardActions = (...buttons) => h('div', { class: 'card-actions' }, buttons.filter(Boolean));

/** Botón del pie de tarjeta (pequeño, mismo tamaño en todas). */
export const actionButton = (label, iconName, onClick, variant = 'ghost') => button(label, { small: true, variant, iconName, onClick });

/** Lista de "etiqueta / valor" en cuadrícula (solo las filas con valor). */
export const facts = (rows) => {
  const shown = rows.filter(([, value]) => value);
  return shown.length ? h('dl', { class: 'facts' }, shown.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))) : null;
};

/** Cabecera de la ficha a todo el ancho: icono, nombre, estado, botón de editar y datos. */
export const detailHead = ({ iconName, title, chip, onEdit, editLabel, rows, notes }) =>
  h(
    'div',
    { class: 'card detail-head' },
    h(
      'div',
      { class: 'hero' },
      h('div', { class: 'thumb' }, icon(iconName, 30)),
      h('div', { class: 'grow' }, h('h2', {}, title), chip ? h('div', { style: 'margin-top:8px' }, chip) : null),
      onEdit ? button(editLabel, { small: true, variant: 'ghost', iconName: 'edit', onClick: onEdit }) : null,
    ),
    facts(rows),
    notes ? h('p', { class: 'notes' }, notes) : null,
  );

/** Lista de registros dentro de una tarjeta (todas iguales). */
export const records = (...items) => h('div', { class: 'records' }, ...items);

/**
 * Un registro: título y dato a la derecha · texto · contenido extra · pie (detalle gris y acciones discretas).
 * `aside` puede ser texto (fecha, importe) o un nodo (estado).
 */
export const record = ({ title, aside, text, extra, meta, actions = [] }) =>
  h(
    'div',
    { class: 'record' },
    h('div', { class: 'head' }, h('span', { class: 'strong' }, title), typeof aside === 'string' ? h('span', { class: 'meta' }, aside) : aside ?? null),
    text ? h('p', { class: 'record-text' }, text) : null,
    extra ?? null,
    h('div', { class: 'record-foot' }, h('span', { class: 'meta' }, meta ?? ''), h('span', { class: 'record-actions' }, actions.filter(Boolean))),
  );

/** Acción secundaria discreta (texto con icono) para los registros de una lista. */
export const linkButton = (label, iconName, onClick, danger = false) =>
  h('button', { type: 'button', class: `link-btn${danger ? ' danger' : ''}`, onclick: onClick }, icon(iconName, 18), label);

/** "Borrar" discreto con confirmación. */
export const deleteLink = (what, action, onDone, { label = 'Borrar', message } = {}) =>
  linkButton(label, 'trash', async () => {
    if (!(await confirmDialog({ title: `¿${label} ${what}?`, message, confirmText: label, danger: true }))) return;
    try {
      await action();
      onDone();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  }, true);
