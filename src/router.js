// Router por hash (#/obras/123). Se eligió el hash porque funciona en cualquier hosting
// estático sin reglas de reescritura y no choca con los enlaces de acceso de Supabase.

const routes = [];

const paramKeys = (path) => [...path.matchAll(/:([a-z]+)/gi)].map((m) => m[1]);
const toRegex = (path) => new RegExp(`^${path.replace(/:[a-z]+/gi, '([^/]+)')}/?$`);

/** @param {{path:string, load:Function, bare?:boolean}[]} list */
export function defineRoutes(list) {
  routes.length = 0;
  for (const route of list) routes.push({ ...route, regex: toRegex(route.path), keys: paramKeys(route.path) });
}

export function currentLocation() {
  const raw = location.hash.replace(/^#/, '');
  // Si el hash no es una ruta (p. ej. tokens de un enlace de acceso), se trata como la portada.
  if (!raw.startsWith('/')) return { path: '/', query: {} };
  const [path, search = ''] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(search)) };
}

export function matchRoute(path) {
  for (const route of routes) {
    const m = route.regex.exec(path);
    if (m) return { route, params: Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (location.hash === target) return refresh();
  if (replace) location.replace(target);
  else location.hash = target;
}

/** Vuelve a cargar la pantalla actual (tras guardar algo, por ejemplo). */
export const refresh = () => window.dispatchEvent(new Event('works:refresh'));

export function startRouter(onChange) {
  window.addEventListener('hashchange', onChange);
  window.addEventListener('works:refresh', onChange);
  onChange();
}
