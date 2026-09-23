// "Staging": listas en memoria para formularios de alta que dejan añadir cosas que en realidad
// cuelgan de un id que todavía no existe (el trabajador, la obra...). Nada se guarda hasta que se
// crea el registro padre; entonces se manda todo lo que quedó en estas listas.

import { button, icon } from './components.js';
import { h } from './dom.js';

export function removableRow(title, subtitle, onRemove) {
  return h(
    'div',
    { class: 'record' },
    h('div', { class: 'head' }, h('span', { class: 'strong' }, title), h('button', { type: 'button', class: 'icon-btn', style: 'width:32px;height:32px', 'aria-label': 'Quitar', onclick: onRemove }, icon('x', 16))),
    subtitle ? h('div', { class: 'muted small' }, subtitle) : null,
  );
}

/**
 * @param {string} addLabel
 * @param {object[]} items          array en memoria (se muta directamente)
 * @param {(item:object, remove:() => void) => Node} renderRow
 * @param {() => void} openAdd      abre lo que sea que añada a `items` y llame a `render()` al terminar
 */
export function stagedSection(addLabel, items, renderRow, openAdd) {
  const list = h('div', { class: 'stack tight' });
  const card = h('div', { class: 'card' });
  function render() {
    list.replaceChildren();
    if (items.length === 0) list.append(h('p', { class: 'muted small' }, 'Nada añadido todavía.'));
    items.forEach((item, index) => list.append(renderRow(item, () => { items.splice(index, 1); render(); })));
  }
  render();
  card.append(list, h('div', { style: 'margin-top:12px' }, button(addLabel, { variant: 'ghost', block: true, small: true, iconName: 'plus', onClick: () => openAdd() })));
  return { el: card, render };
}
