// Portada de las listas maestras: trabajadores y proveedores.

import { listProviders, listWorkers } from '../lib/api.js';
import { icon } from '../ui/components.js';
import { h } from '../ui/dom.js';

export default async function listas() {
  const [workers, providers] = await Promise.all([listWorkers(), listProviders()]);

  const row = (href, iconName, title, list) => {
    const active = list.filter((x) => x.active).length;
    return h(
      'a',
      { class: 'item', href },
      h('div', { class: 'thumb' }, icon(iconName, 24)),
      h('div', { class: 'grow' }, h('div', { class: 'what' }, title), h('div', { class: 'muted small' }, `${active} ${active === 1 ? 'activo' : 'activos'}${list.length > active ? ` · ${list.length - active} de baja` : ''}`)),
      icon('chevron', 22),
    );
  };

  const node = h(
    'div',
    { class: 'stack' },
    row('#/trabajadores', 'users', 'Trabajadores', workers),
    row('#/proveedores', 'truck', 'Proveedores', providers),
  );

  return { title: 'Listas', node, tab: 'listas' };
}
