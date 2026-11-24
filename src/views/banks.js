// Lista de bancos: búsqueda y semáforo del producto más urgente de cada uno (si tiene alguno con
// fecha de finalización).

import { listAllBankProducts, listBanks } from '../lib/api.js';
import { worstDueStatus } from '../lib/dueStatus.js';
import { productDueStatus } from '../lib/loans.js';
import { chip, empty, icon } from '../ui/components.js';
import { h } from '../ui/dom.js';

const STATUS_LABEL = { ok: 'Al día', soon: 'Producto próximo', overdue: 'Producto vencido' };

export default async function banksList() {
  const [all, products] = await Promise.all([listBanks(), listAllBankProducts()]);
  const statusByBank = new Map();
  for (const p of products) {
    const status = productDueStatus(p);
    if (!status) continue;
    statusByBank.set(p.bank_id, worstDueStatus([statusByBank.get(p.bank_id), status]));
  }

  let text = '';
  let showInactive = false;
  const listHost = h('div', { class: 'list-grid' });
  const subtitle = (b) => [b.contact_name, b.phone].filter(Boolean).join(' · ');

  function render() {
    listHost.replaceChildren();
    const shown = all.filter((b) => (showInactive ? true : b.active)).filter((b) => !text || `${b.name} ${subtitle(b)}`.toUpperCase().includes(text));
    if (shown.length === 0) {
      listHost.append(empty(all.length === 0 ? 'Aún no hay bancos.' : 'No hay resultados.'));
      return;
    }
    for (const b of shown) {
      const status = statusByBank.get(b.id);
      listHost.append(
        h(
          'a',
          { class: 'item', href: `#/bancos/${b.id}` },
          h('div', { class: 'thumb' }, icon('euro', 24)),
          h('div', { class: 'grow' }, h('div', { class: 'what' }, b.name), h('div', { class: 'muted small' }, subtitle(b))),
          !b.active ? chip('De baja', 'neutral') : status ? chip(STATUS_LABEL[status], status) : null,
        ),
      );
    }
  }

  const search = h('input', { type: 'search', placeholder: 'Buscar banco…', 'aria-label': 'Buscar banco', autocomplete: 'off', oninput: (event) => { text = event.target.value.toUpperCase(); render(); } });

  const node = h('div', { class: 'stack has-fab' }, search);
  if (all.some((b) => !b.active)) {
    node.append(h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (event) => { showInactive = event.target.checked; render(); } }), 'Mostrar bancos de baja'));
  }
  node.append(listHost);
  node.append(h('a', { class: 'fab', href: '#/bancos/nuevo', 'aria-label': 'Añadir banco' }, icon('plus')));
  render();

  return { title: 'Bancos', node, tab: 'finanzas', wide: true };
}
