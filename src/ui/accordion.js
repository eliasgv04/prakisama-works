// Tarjeta plegable (acordeón) basada en <details>/<summary>: accesible con teclado y lector de
// pantalla sin código extra. Cerrada muestra un icono, un título y un resumen de su estado; al
// tocarla se abre y enseña su contenido.

import { icon } from './components.js';
import { h } from './dom.js';

/**
 * @param {object} o
 * @param {string} o.group       tarjetas del mismo grupo se cierran entre sí (ver makeExclusive)
 * @param {string} [o.iconName]  icono de la izquierda
 * @param {string} o.title
 * @param {string} [o.summary]   una línea con el estado actual
 * @param {boolean} [o.warn]     resumen en ámbar (algo por configurar)
 * @param {Node|null} [o.badge]  etiqueta pequeña a la derecha (p. ej. un chip)
 * @param {boolean} [o.sub]      versión compacta para tarjetas dentro de otra tarjeta
 * @param {Node|Node[]} o.content
 * @returns {{el: HTMLDetailsElement, set: (s: {summary?: string, warn?: boolean, badge?: Node|null}) => void}}
 */
export function accordion({ group, iconName, title, summary = '', warn = false, badge = null, sub = false, content }) {
  const summaryEl = h('span', { class: 'acc-sum' });
  const badgeSlot = h('span', { class: 'acc-badge' });
  const el = h(
    'details',
    { class: `acc${sub ? ' sub' : ''}`, dataset: { group } },
    h(
      'summary',
      {},
      iconName ? h('span', { class: 'acc-icon' }, icon(iconName, 24)) : null,
      h('span', { class: 'acc-text' }, h('span', { class: 'acc-title' }, title), summaryEl, badgeSlot),
      h('span', { class: 'acc-chev' }, icon('chevron', 22)),
    ),
    h('div', { class: 'acc-body' }, content),
  );

  const api = {
    el,
    /** Actualiza el resumen/etiqueta sin volver a pintar la pantalla (se llama tras guardar). */
    set(next) {
      if (next.summary !== undefined) summaryEl.textContent = next.summary;
      if (next.warn !== undefined) summaryEl.classList.toggle('warn', next.warn);
      if (next.badge !== undefined) badgeSlot.replaceChildren(...(next.badge ? [next.badge] : []));
    },
  };
  api.set({ summary, warn, badge });
  return api;
}

/**
 * Solo una tarjeta abierta por grupo: al abrir una se cierran las demás del mismo `group`, así la
 * pantalla se mantiene corta. Las de nivel superior además se desplazan hasta arriba al abrirse.
 * (`toggle` no burbujea, por eso se escucha en fase de captura.)
 */
export function makeExclusive(root) {
  root.addEventListener(
    'toggle',
    (event) => {
      const opened = event.target;
      if (!(opened instanceof HTMLDetailsElement) || !opened.open) return;
      for (const other of root.querySelectorAll(`details[data-group="${opened.dataset.group}"]`)) {
        if (other !== opened) other.open = false;
      }
      if (!opened.classList.contains('sub')) {
        requestAnimationFrame(() => opened.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
    },
    true,
  );
}
