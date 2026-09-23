// Lista de trabajadores: búsqueda y semáforo del reconocimiento médico (si hay alguno registrado).

import { listLatestMedicalCheckups, listWorkers } from '../lib/api.js';
import { dueStatus } from '../lib/dueStatus.js';
import { chip, empty, icon } from '../ui/components.js';
import { h } from '../ui/dom.js';

const STATUS_LABEL = { ok: 'Reconocimiento OK', soon: 'Reconocimiento próximo', overdue: 'Reconocimiento vencido' };

export default async function workersList() {
  const [all, latestCheckups] = await Promise.all([listWorkers(), listLatestMedicalCheckups()]);
  let text = '';
  let showInactive = false;
  const listHost = h('div', { class: 'list-grid' });

  const subtitle = (w) => [w.role, w.phone].filter(Boolean).join(' · ');

  function render() {
    listHost.replaceChildren();
    const shown = all
      .filter((w) => (showInactive ? true : w.active))
      .filter((w) => !text || `${w.full_name} ${subtitle(w)}`.toUpperCase().includes(text));
    if (shown.length === 0) {
      listHost.append(empty(all.length === 0 ? 'Aún no hay trabajadores.' : 'No hay resultados.'));
      return;
    }
    for (const w of shown) {
      const status = dueStatus(latestCheckups.get(w.id)?.valid_until ?? null);
      listHost.append(
        h(
          'a',
          { class: 'item', href: `#/trabajadores/${w.id}` },
          h('div', { class: 'thumb' }, icon('users', 24)),
          h('div', { class: 'grow' }, h('div', { class: 'what' }, w.full_name), h('div', { class: 'muted small' }, subtitle(w))),
          !w.active ? chip('De baja', 'neutral') : status ? chip(STATUS_LABEL[status], status) : null,
        ),
      );
    }
  }

  const search = h('input', { type: 'search', placeholder: 'Buscar trabajador…', 'aria-label': 'Buscar trabajador', autocomplete: 'off', oninput: (event) => { text = event.target.value.toUpperCase(); render(); } });

  const node = h('div', { class: 'stack has-fab' }, search);
  if (all.some((w) => !w.active)) {
    node.append(h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (event) => { showInactive = event.target.checked; render(); } }), 'Mostrar trabajadores de baja'));
  }
  node.append(listHost);
  node.append(h('a', { class: 'fab', href: '#/trabajadores/nuevo', 'aria-label': 'Añadir trabajador' }, icon('plus')));
  render();

  return { title: 'Trabajadores', node, tab: 'listas', back: '/listas', wide: true };
}
