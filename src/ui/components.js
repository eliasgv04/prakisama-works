// Componentes de interfaz reutilizables (funciones que devuelven nodos DOM).

import logoUrl from '../assets/logo-prakisama.png';
import { h } from './dom.js';

// ---------- Iconos (SVG en línea, trazo) ----------
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h6"/>',
  truck: '<path d="M2 6h12v10H2z"/><path d="M14 9h4l4 4v3h-8z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-3 3-2.5-.5-.5-2.5z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5S15.5 16.5 15.5 20"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17.5 14.5c2.5 0 4 1.5 4 4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  camera: '<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  euro: '<path d="M17 6a6 6 0 1 0 0 12"/><path d="M4 10h9M4 14h9"/>',
};

export function icon(name, size) {
  const span = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  span.setAttribute('viewBox', '0 0 24 24');
  span.setAttribute('class', 'icon');
  span.setAttribute('aria-hidden', 'true');
  if (size) {
    span.setAttribute('width', size);
    span.setAttribute('height', size);
  }
  span.innerHTML = ICONS[name] ?? ''; // contenido estático propio, nunca datos de usuario
  return span;
}

// ---------- Chips de estado (sin semáforo: solo binarios — hecho/pendiente, activo/de baja...) ----------
export const chip = (label, kind = 'neutral') => h('span', { class: `chip ${kind}` }, label);

// ---------- Botones ----------
export function button(label, { onClick, variant = '', type = 'button', iconName, block = false, small = false, disabled = false } = {}) {
  return h(
    'button',
    { class: ['btn', variant, block ? 'block' : '', small ? 'small' : ''].filter(Boolean).join(' '), type, onclick: onClick, disabled },
    iconName ? icon(iconName) : null,
    label,
  );
}

export function iconButton(iconName, label, onClick) {
  return h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, title: label, onclick: onClick }, icon(iconName));
}

// ---------- Campos de formulario ----------
function wrapField(label, control, { hint, warn } = {}) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint' }, hint) : null, warn ?? null);
}

export function textField(label, name, { value = '', type = 'text', required = false, hint, placeholder, ...rest } = {}) {
  const input = h('input', { type, name, value: value ?? '', required, placeholder, ...rest });
  return wrapField(label, input, { hint });
}

export function areaField(label, name, { value = '', hint, placeholder } = {}) {
  return wrapField(label, h('textarea', { name, placeholder }, value ?? ''), { hint });
}

export function selectField(label, name, options, { value = '', required = false, hint, onChange } = {}) {
  const select = h('select', { name, required, onchange: onChange }, options.map(([optValue, optLabel]) => h('option', { value: optValue }, optLabel)));
  select.value = value ?? ''; // después de crear las opciones
  return wrapField(label, select, { hint });
}

const PERIOD_UNIT_LABELS = { day: 'Días', month: 'Meses', year: 'Años' };

/**
 * Periodo = cantidad + unidad (días/meses/años). Sin `name` en los controles: no entra en
 * readForm(); se lee con `field.read()` → { amount, unit } (amount null si está vacío).
 * `field.onChange(fn)` avisa en cada cambio, para recalcular la fecha resultante al momento.
 */
export function periodField(label, { amount = null, unit = 'month', units = ['day', 'month', 'year'], hint } = {}) {
  const number = h('input', { type: 'number', inputmode: 'numeric', min: 1, step: 1, value: amount ?? '', placeholder: 'Sin indicar' });
  const select = h('select', {}, units.map((u) => h('option', { value: u }, PERIOD_UNIT_LABELS[u])));
  select.value = units.includes(unit) ? unit : units[0];
  const field = wrapField(label, h('div', { class: 'row2' }, number, select), { hint });
  field.read = () => ({ amount: toInt(number.value), unit: select.value });
  field.onChange = (fn) => {
    number.addEventListener('input', fn);
    select.addEventListener('change', fn);
  };
  return field;
}

/**
 * Campo de elegir uno entre muchos con buscador (p. ej. 467 proveedores: un <select> no sirve).
 * `options` = [[valor, etiqueta, texto extra para buscar?]]. Escribe en un <input hidden name>,
 * así entra en readForm() como cualquier otro campo. Enseña como mucho `max` resultados.
 */
export function searchPickField(label, name, options, { value = '', placeholder = 'Escribe para buscar…', max = 8 } = {}) {
  const hidden = h('input', { type: 'hidden', name, value: value ?? '' });
  const search = h('input', { type: 'search', placeholder, autocomplete: 'off', 'aria-label': label });
  const results = h('div', { class: 'pick-results' });
  const labelOf = (v) => options.find(([optValue]) => optValue === v)?.[1] ?? '';
  // Sin tildes ni mayúsculas: "garcia" encuentra "GARCÍA".
  const norm = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const index = options.map(([optValue, optLabel, extra]) => [optValue, optLabel, norm(`${optLabel} ${extra ?? ''}`)]);

  function render() {
    results.replaceChildren();
    const words = norm(search.value).split(/\s+/).filter(Boolean);
    if (words.length === 0) return;
    const found = index.filter(([, , text]) => words.every((w) => text.includes(w)));
    for (const [optValue, optLabel] of found.slice(0, max)) {
      results.append(h('button', { type: 'button', class: 'pick-option', onclick: () => choose(optValue) }, optLabel));
    }
    if (found.length === 0) results.append(h('p', { class: 'muted small' }, 'Sin resultados.'));
    else if (found.length > max) results.append(h('p', { class: 'muted small' }, `${found.length - max} más: sigue escribiendo para afinar.`));
  }
  function choose(optValue) {
    hidden.value = optValue;
    search.value = labelOf(optValue);
    results.replaceChildren();
  }
  search.addEventListener('input', () => { hidden.value = ''; render(); });
  if (value) search.value = labelOf(value);

  return wrapField(label, h('div', { class: 'pick' }, hidden, search, results));
}

export function checkField(label, name, checked = false) {
  return h('label', { class: 'check' }, h('input', { type: 'checkbox', name, checked }), label);
}

/** Logo grande + nombre de la app, para las pantallas sin barras (acceso). */
export const brandHeader = (title, lead) => [
  h('img', { class: 'logo', src: logoUrl, alt: 'Prakisama, S.L. Construcciones', width: 300, height: 108 }),
  h('div', { class: 'eyebrow' }, 'Gestión de obras y personal'),
  h('h1', {}, title),
  lead ? h('p', { class: 'lead' }, lead) : null,
];

export const section = (title, ...content) => h('section', { class: 'section' }, h('div', { class: 'section-title' }, title), ...content);

export const empty = (text, ...extra) => h('div', { class: 'empty' }, h('p', {}, text), ...extra);

export const spinner = () => h('div', { class: 'spinner', role: 'status', 'aria-label': 'Cargando' });

export const banner = (text, kind = 'info') => h('div', { class: `banner ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, text);

/** Lee un <form> como objeto plano (checkbox → booleano, vacío → null). */
export function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else if (el.type === 'file') continue;
    else out[el.name] = el.value.trim() === '' ? null : el.value.trim();
  }
  return out;
}

export const toInt = (value) => (value === null || value === undefined || value === '' ? null : Math.round(Number(value)));
export const toNum = (value) => (value === null || value === undefined || value === '' ? null : Number(value));
