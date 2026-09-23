// Fábrica de pantallas para las listas maestras (trabajadores, proveedores, subcontratas): las tres
// son "nombre + un puñado de datos de contacto + notas + baja lógica", así que comparten una única
// pantalla de lista y una de formulario en vez de triplicar el mismo código.

import { friendlyError } from '../lib/errors.js';
import { navigate } from '../router.js';
import { listItem } from '../ui/cards.js';
import { areaField, button, empty, icon, textField } from '../ui/components.js';
import { readForm } from '../ui/components.js';
import { confirmDialog, h, toast } from '../ui/dom.js';

/**
 * @param {object} cfg
 * @param {string} cfg.singular   "trabajador" (minúscula, para los mensajes)
 * @param {string} cfg.plural     "Trabajadores" (título)
 * @param {string} cfg.route      "/trabajadores"
 * @param {string} cfg.nameField  columna del nombre ("full_name" o "name")
 * @param {string} cfg.nameLabel  etiqueta del campo nombre ("Nombre")
 * @param {{key:string, label:string, type?:string}[]} cfg.fields   resto de campos, en orden
 * @param {() => Promise<object[]>} cfg.list
 * @param {(id:string|null, fields:object) => Promise<object>} cfg.save
 * @param {(id:string, active:boolean) => Promise<object>} cfg.setActive
 * @param {string} [cfg.tab]      pestaña activa en la barra (por defecto "listas")
 * @param {string|null} [cfg.listBack]  flecha "volver" de la lista (por defecto "/listas"; null = sin flecha, es una pestaña de nivel superior)
 */
export function makeEntityViews(cfg) {
  const tab = cfg.tab ?? 'listas';
  const listBack = cfg.listBack === undefined ? '/listas' : cfg.listBack;
  const subtitleOf = (row) => cfg.fields.map((f) => row[f.key]).filter(Boolean).join(' · ');

  async function list() {
    const all = await cfg.list();
    let text = '';
    let showInactive = false;
    const listHost = h('div', { class: 'list-grid' });

    function render() {
      listHost.replaceChildren();
      const shown = all.filter((r) => (showInactive ? true : r.active)).filter((r) => !text || `${r[cfg.nameField]} ${subtitleOf(r)}`.toUpperCase().includes(text));
      if (shown.length === 0) {
        listHost.append(empty(all.length === 0 ? `Aún no hay ${cfg.plural.toLowerCase()}.` : 'No hay resultados.'));
        return;
      }
      for (const row of shown) listHost.append(listItem({ href: `#${cfg.route}/${row.id}`, title: row[cfg.nameField], subtitle: subtitleOf(row), active: row.active, iconName: cfg.iconName }));
    }

    const search = h('input', {
      type: 'search',
      placeholder: `Buscar ${cfg.singular}…`,
      'aria-label': `Buscar ${cfg.singular}`,
      autocomplete: 'off',
      oninput: (event) => { text = event.target.value.toUpperCase(); render(); },
    });

    const node = h('div', { class: 'stack has-fab' }, search);
    if (all.some((r) => !r.active)) {
      node.append(h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (event) => { showInactive = event.target.checked; render(); } }), `Mostrar ${cfg.plural.toLowerCase()} de baja`));
    }
    node.append(listHost);
    node.append(h('a', { class: 'fab', href: `#${cfg.route}/nuevo`, 'aria-label': `Añadir ${cfg.singular}` }, icon('plus')));
    render();

    return { title: cfg.plural, node, tab, back: listBack, wide: true };
  }

  async function form({ params }) {
    const editing = Boolean(params.id);
    let row = null;
    if (editing) {
      row = (await cfg.list()).find((r) => r.id === params.id);
      if (!row) throw new Error(`No se encuentra este ${cfg.singular}.`);
    }
    const r = row ?? {};

    const nameInput = textField(cfg.nameLabel, 'name_field', { required: true, value: r[cfg.nameField] ?? '' });
    const otherFields = cfg.fields.map((f) => textField(f.label, f.key, { type: f.type ?? 'text', value: r[f.key] ?? '', placeholder: f.placeholder }));
    const notes = areaField('Notas', 'notes', { value: r.notes ?? '' });

    const save = button('Guardar', { type: 'submit', block: true, iconName: 'check' });
    const formEl = h(
      'form',
      {
        class: 'stack',
        onsubmit: async (event) => {
          event.preventDefault();
          const f = readForm(formEl);
          if (!f.name_field) return toast(`Escribe el nombre.`, 'error');
          const fields = { [cfg.nameField]: f.name_field, notes: f.notes };
          for (const fld of cfg.fields) fields[fld.key] = f[fld.key];
          save.disabled = true;
          try {
            const saved = await cfg.save(params.id ?? null, fields);
            toast(`${cfg.singular[0].toUpperCase()}${cfg.singular.slice(1)} guardado`, 'success');
            navigate(`${cfg.route}/${saved.id}`);
          } catch (err) {
            toast(friendlyError(err), 'error');
            save.disabled = false;
          }
        },
      },
      nameInput,
      ...otherFields,
      notes,
      save,
    );

    const node = h('div', { class: 'stack' }, formEl);
    if (editing) {
      node.append(
        row.active
          ? button('Dar de baja', {
              variant: 'danger',
              block: true,
              onClick: async () => {
                const ok = await confirmDialog({ title: `¿Dar de baja este ${cfg.singular}?`, message: 'Dejará de aparecer en las listas activas. No se borra nada: se puede reactivar cuando quieras.', confirmText: 'Dar de baja', danger: true });
                if (!ok) return;
                try {
                  await cfg.setActive(row.id, false);
                  toast(`${cfg.singular[0].toUpperCase()}${cfg.singular.slice(1)} dado de baja`, 'success');
                  navigate(cfg.route);
                } catch (err) {
                  toast(friendlyError(err), 'error');
                }
              },
            })
          : button('Reactivar', {
              block: true,
              onClick: async () => {
                try {
                  await cfg.setActive(row.id, true);
                  toast('Reactivado', 'success');
                  navigate(`${cfg.route}/${row.id}`);
                } catch (err) {
                  toast(friendlyError(err), 'error');
                }
              },
            }),
      );
    }

    return { title: editing ? `Editar ${cfg.singular}` : `Nuevo ${cfg.singular}`, back: editing ? `${cfg.route}/${params.id}` : cfg.route, tab, node };
  }

  return { list, form };
}
