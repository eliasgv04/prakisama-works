// Helpers mínimos para construir DOM sin frameworks.
// Seguridad: los hijos de tipo texto se añaden como nodos de texto, NUNCA como HTML, así que un
// nombre o una nota con "<script>" se muestra tal cual y no se ejecuta.

// Propiedades que hay que fijar como atributo (son de solo lectura o se comportan distinto como propiedad).
const ATTR_ONLY = new Set(['list', 'form', 'style', 'role', 'for', 'capture']);

/** h('button', { class: 'btn', onclick: fn }, 'Texto', otroNodo) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key.startsWith('aria-') || ATTR_ONLY.has(key) || !(key in el)) el.setAttribute(key, value === true ? '' : String(value));
    else el[key] = value;
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// ---------- Toasts ----------
let toastHost = null;
export function toast(message, kind = 'info', ms = 3800) {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const node = h('div', { class: `toast ${kind}` }, message);
  toastHost.append(node);
  setTimeout(() => node.remove(), ms);
}

// ---------- Diálogos (hoja inferior) ----------
/**
 * Abre una hoja modal. `build(close)` devuelve el contenido, o una promesa de él si antes hay que
 * cargar algo (p. ej. la lista de proveedores para elegir uno): mientras tanto se ve "Cargando…".
 * Resuelve con el valor pasado a close().
 */
export function openSheet(title, build) {
  return new Promise((resolve) => {
    const dialog = h('dialog', {});
    const body = h('div', {}, h('p', { class: 'muted' }, 'Cargando…'));
    let result;
    const close = (value) => {
      result = value;
      dialog.close();
    };
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close(); // clic en el fondo oscuro
    });
    append(dialog, [h('h3', {}, title), body]);
    document.body.append(dialog);
    dialog.showModal();

    const content = build(close);
    Promise.resolve(content).then((node) => {
      if (!dialog.isConnected) return; // se cerró antes de terminar de cargar
      clear(body);
      append(body, [node]);
    });
  });
}

export function confirmDialog({ title, message, confirmText = 'Aceptar', danger = false }) {
  return openSheet(title, (close) =>
    h(
      'div',
      { class: 'stack' },
      message ? h('p', { class: 'muted' }, message) : null,
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => close(false) }, 'Cancelar'),
        h('button', { class: `btn ${danger ? 'danger' : ''}`, type: 'button', onclick: () => close(true) }, confirmText),
      ),
    ),
  ).then(Boolean);
}
