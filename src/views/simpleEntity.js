// Fábrica de pantallas para listas maestras "nombre + un puñado de datos de contacto + notas +
// baja lógica" (proveedores, bancos), para no duplicar el mismo código en cada una.

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
 * @param {{key:string, label:string, type?:string, listable?:boolean}[]} cfg.fields   resto de campos, en orden (listable:false = no sale en la línea de la lista, solo en el formulario)
 * @param {() => Promise<object[]>} cfg.list
 * @param {(id:string|null, fields:object) => Promise<object>} cfg.save
 * @param {(id:string, active:boolean) => Promise<object>} cfg.setActive
 * @param {(id:string) => Promise<void>} cfg.delete   borrado de verdad (distinto de dar de baja)
 * @param {string} [cfg.deleteWarning]  mensaje del diálogo de confirmación al eliminar (por defecto, avisa de que si tiene algo asignado no se podrá)
 * @param {string} [cfg.tab]      pestaña activa en la barra (por defecto "listas")
 * @param {string|null} [cfg.listBack]  flecha "volver" de la lista (por defecto "/listas"; null = sin flecha, es una pestaña de nivel superior)
 * @param {number} [cfg.pageSize]  si se pone, la lista enseña los resultados de N en N con un botón
 *   "Mostrar N más" (proveedores: 467 de golpe hacían la pantalla eterna). Sin ponerlo, todos.
 * @param {boolean} [cfg.hasDetail]  true si `${route}/:id` es una ficha aparte del formulario de edición
 *   (como bancos, con `:id/editar` propio). Si es false (por defecto: proveedores no lo usan así,
 *   `${route}/:id` YA es el formulario), "volver" al editar no puede apuntar a `${route}/:id` —
 *   sería la misma página en la que ya estás, y navigate() no haría nada.
 */
export function makeEntityViews(cfg) {
  const tab = cfg.tab ?? 'listas';
  const listBack = cfg.listBack === undefined ? '/listas' : cfg.listBack;
  // Solo los campos "listables" entran en la línea de la lista: con muchos campos, meterlos
  // todos ahí sería ilegible (p. ej. la dirección o el número de cuenta se quedan solo en el formulario).
  const subtitleOf = (row) => cfg.fields.filter((f) => f.listable !== false).map((f) => row[f.key]).filter(Boolean).join(' · ');

  async function list() {
    const all = await cfg.list();
    let text = '';
    let showInactive = false;
    let limit = cfg.pageSize ?? Infinity;
    const listHost = h('div', { class: 'list-grid' });
    const moreHost = h('div', {});

    function render() {
      listHost.replaceChildren();
      moreHost.replaceChildren();
      const shown = all.filter((r) => (showInactive ? true : r.active)).filter((r) => !text || `${r[cfg.nameField]} ${subtitleOf(r)}`.toUpperCase().includes(text));
      if (shown.length === 0) {
        listHost.append(empty(all.length === 0 ? `Aún no hay ${cfg.plural.toLowerCase()}.` : 'No hay resultados.'));
        return;
      }
      for (const row of shown.slice(0, limit)) listHost.append(listItem({ href: `#${cfg.route}/${row.id}`, title: row[cfg.nameField], subtitle: subtitleOf(row), active: row.active, iconName: cfg.iconName }));
      if (shown.length > limit) {
        moreHost.append(
          h('p', { class: 'muted small', style: 'text-align:center' }, `Mostrando ${limit} de ${shown.length}`),
          button(`Mostrar ${Math.min(cfg.pageSize, shown.length - limit)} más`, { variant: 'ghost', block: true, onClick: () => { limit += cfg.pageSize; render(); } }),
        );
      }
    }
    // Al cambiar la búsqueda o el filtro se vuelve a la primera página.
    const resetPage = () => { limit = cfg.pageSize ?? Infinity; };

    const search = h('input', {
      type: 'search',
      placeholder: `Buscar ${cfg.singular}…`,
      'aria-label': `Buscar ${cfg.singular}`,
      autocomplete: 'off',
      oninput: (event) => { text = event.target.value.toUpperCase(); resetPage(); render(); },
    });

    const node = h('div', { class: 'stack has-fab' }, search);
    if (all.some((r) => !r.active)) {
      node.append(h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (event) => { showInactive = event.target.checked; resetPage(); render(); } }), `Mostrar ${cfg.plural.toLowerCase()} de baja`));
    }
    node.append(listHost, moreHost);
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
        button('Eliminar', {
          variant: 'danger',
          block: true,
          onClick: async () => {
            const ok = await confirmDialog({
              title: `¿Eliminar este ${cfg.singular}?`,
              message: cfg.deleteWarning ?? 'Se borra de verdad, no se puede deshacer. Si tiene algo asignado (por ejemplo, una obra), no se podrá borrar hasta quitarlo de ahí.',
              confirmText: 'Eliminar',
              danger: true,
            });
            if (!ok) return;
            try {
              await cfg.delete(row.id);
              toast(`${cfg.singular[0].toUpperCase()}${cfg.singular.slice(1)} eliminado`, 'success');
              navigate(cfg.route);
            } catch (err) {
              toast(friendlyError(err), 'error');
            }
          },
        }),
      );
    }

    const editBack = cfg.hasDetail ? `${cfg.route}/${params.id}` : cfg.route;
    return { title: editing ? `Editar ${cfg.singular}` : `Nuevo ${cfg.singular}`, back: editing ? editBack : cfg.route, tab, node };
  }

  return { list, form };
}
