// Tarjetas compartidas por varias pantallas.

import { chip, icon } from './components.js';
import { h } from './dom.js';

/** Fila de una lista (trabajador, proveedor, subcontrata, obra...): nombre + subtítulo + estado. */
export function listItem({ href, title, subtitle, active = true, iconName = 'file' }) {
  return h(
    'a',
    { class: 'item', href },
    h('div', { class: 'thumb' }, icon(iconName, 24)),
    h('div', { class: 'grow' }, h('div', { class: 'line1' }, h('span', { class: 'what' }, title)), subtitle ? h('div', { class: 'muted small' }, subtitle) : null),
    active ? null : chip('De baja', 'neutral'),
  );
}
