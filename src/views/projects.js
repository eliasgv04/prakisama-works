// Lista de obras: búsqueda y acceso a la ficha.

import { fmtDate, fmtMoney } from '../lib/format.js';
import { listProjects } from '../lib/api.js';
import { chip, empty, icon } from '../ui/components.js';
import { h } from '../ui/dom.js';

export default async function projectsList() {
  const all = await listProjects();
  let text = '';
  let showInactive = false;
  const listHost = h('div', { class: 'list-grid' });

  const subtitle = (p) => [p.reference, p.start_date ? `desde ${fmtDate(p.start_date)}` : null, p.total_amount != null ? fmtMoney(p.total_amount) : null].filter(Boolean).join(' · ');

  function render() {
    listHost.replaceChildren();
    const shown = all
      .filter((p) => (showInactive ? true : p.active))
      .filter((p) => !text || `${p.name} ${p.reference ?? ''}`.toUpperCase().includes(text))
      .sort((a, b) => (a.active !== b.active ? (a.active ? -1 : 1) : a.name.localeCompare(b.name, 'es')));
    if (shown.length === 0) {
      listHost.append(empty(all.length === 0 ? 'Aún no hay obras.' : 'No hay obras que coincidan.'));
      return;
    }
    for (const p of shown) {
      listHost.append(
        h(
          'a',
          { class: 'item', href: `#/obras/${p.id}` },
          h('div', { class: 'thumb' }, icon('clipboard', 24)),
          h('div', { class: 'grow' }, h('div', { class: 'what' }, p.name), h('div', { class: 'muted small' }, subtitle(p))),
          p.active ? null : chip('De baja', 'neutral'),
        ),
      );
    }
  }

  const search = h('input', { type: 'search', placeholder: 'Buscar obra o referencia…', 'aria-label': 'Buscar obra', autocomplete: 'off', oninput: (event) => { text = event.target.value.toUpperCase(); render(); } });

  const node = h('div', { class: 'stack has-fab' }, search);
  if (all.some((p) => !p.active)) {
    node.append(h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (event) => { showInactive = event.target.checked; render(); } }), 'Mostrar obras de baja'));
  }
  node.append(listHost);
  node.append(h('a', { class: 'fab', href: '#/obras/nueva', 'aria-label': 'Añadir obra' }, icon('plus')));
  render();

  return { title: 'Obras', node, tab: 'obras', wide: true };
}
