// Estructura común de pantalla: barra superior, contenido y barra de pestañas inferior.

import logoUrl from '../assets/logo-prakisama.png';
import { navigate } from '../router.js';
import { fmtDateTime } from '../lib/format.js';
import { banner, button, icon, iconButton, spinner } from './components.js';
import { clear, h } from './dom.js';

const TABS = [
  { id: 'panel', path: '/', label: 'Panel', icon: 'home' },
  { id: 'obras', path: '/obras', label: 'Obras', icon: 'clipboard' },
  { id: 'horas', path: '/horas', label: 'Horas', icon: 'clock' },
  { id: 'finanzas', path: '/bancos', label: 'Finanzas', icon: 'euro' },
  { id: 'listas', path: '/listas', label: 'Listas', icon: 'users' },
  { id: 'cuenta', path: '/cuenta', label: 'Cuenta', icon: 'user' },
];

/**
 * Una "vista" es { title, node, back?, actions?, tab?, bare?, hideTitle?, wide? }.
 * `back` es la ruta a la que vuelve la flecha; `bare` oculta barras (pantalla de acceso);
 * `hideTitle` no pinta el titular grande; `wide` usa todo el ancho en pantallas grandes.
 */
export function createShell(root) {
  const backSlot = h('div');
  const actionsSlot = h('div', { style: 'display:flex' });
  // Logo + "WORKS": la marca de la empresa y el nombre de la app, juntos.
  const brand = h(
    'a',
    { class: 'brand', href: '#/', 'aria-label': 'Prakisama Works: ir al panel' },
    h('img', { src: logoUrl, alt: 'Prakisama, S.L. Construcciones', width: 100, height: 36 }),
    h('span', { class: 'brand-sep', 'aria-hidden': 'true' }),
    h('span', { class: 'brand-name' }, 'Works'),
  );
  // En pantallas anchas el menú va arriba (como en prakisama.com); en el móvil, en la barra inferior.
  const topnav = h('nav', { class: 'topnav', 'aria-label': 'Navegación principal' });
  const topbar = h('header', { class: 'topbar' }, h('div', { class: 'topbar-in' }, backSlot, brand, topnav, actionsSlot));
  const main = h('main', { class: 'main', id: 'main' });
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Navegación principal' });
  const shell = h('div', { class: 'shell' }, topbar, main, tabbar);
  root.replaceChildren(shell);

  function renderTabs(active) {
    clear(tabbar);
    clear(topnav);
    for (const tab of TABS) {
      const current = tab.id === active ? 'page' : null;
      tabbar.append(h('a', { href: `#${tab.path}`, 'aria-current': current }, icon(tab.icon), tab.label));
      topnav.append(h('a', { href: `#${tab.path}`, 'aria-current': current }, tab.label));
    }
  }

  return {
    showLoading() {
      main.replaceChildren(spinner());
    },

    showError(err, retry) {
      main.replaceChildren(banner(err?.message || 'Ha ocurrido un error inesperado.', 'error'), retry ? button('Reintentar', { onClick: retry, block: true }) : null);
    },

    show(view) {
      const bare = Boolean(view.bare);
      shell.classList.toggle('bare', bare);
      topbar.hidden = bare;
      tabbar.hidden = bare;

      document.title = view.title ? `${view.title} · Prakisama Works` : 'Prakisama Works';
      clear(backSlot);
      if (view.back) backSlot.append(iconButton('back', 'Volver', () => navigate(view.back)));
      clear(actionsSlot);
      for (const action of view.actions ?? []) actionsSlot.append(action);
      renderTabs(view.tab);

      main.className = view.wide ? 'main wide' : 'main';
      clear(main);
      if (view.title && !bare && !view.hideTitle) main.append(h('h1', { class: 'page-title' }, view.title));
      main.append(view.node);
      window.scrollTo(0, 0);
    },
  };
}
