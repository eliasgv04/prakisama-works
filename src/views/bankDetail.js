// Ficha del banco: datos de contacto y sus productos (préstamos, avales, líneas de crédito...),
// cada uno con semáforo si tiene fecha de finalización y, opcionalmente, la obra a la que garantiza
// (para los avales: se ven igual desde la obra, en su sección "Aval").

import { addBankProduct, deleteBankProduct, listBankProducts, listBanks, listProjects, updateBankProduct } from '../lib/api.js';
import { dueStatus } from '../lib/dueStatus.js';
import { friendlyError } from '../lib/errors.js';
import { fmtDate, fmtMoney } from '../lib/format.js';
import { navigate } from '../router.js';
import { button, chip, icon, readForm, section, selectField, textField, toNum } from '../ui/components.js';
import { confirmDialog, h, openSheet, toast } from '../ui/dom.js';

const STATUS_LABEL = { ok: 'Al día', soon: 'Próximo', overdue: 'Vencido' };

export default async function bankDetail({ params }) {
  const [bank, products] = await Promise.all([listBanks().then((all) => all.find((b) => b.id === params.id)), listBankProducts(params.id)]);
  if (!bank) throw new Error('No se encuentra este banco.');

  const node = h('div', { class: 'stack' }, heroCard(bank), productsCard(bank, products));
  node.append(h('div', { class: 'spacer' }), button('Editar banco', { variant: 'ghost', block: true, iconName: 'edit', onClick: () => navigate(`/bancos/${bank.id}/editar`) }));

  return { title: bank.name, hideTitle: true, back: '/bancos', tab: 'finanzas', node };
}

function heroCard(bank) {
  const rows = [['Contacto', bank.contact_name], ['Teléfono', bank.phone], ['Email', bank.email]].filter(([, v]) => v);
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'hero' }, h('div', { class: 'thumb' }, icon('euro', 30)), h('div', { class: 'grow' }, h('h2', {}, bank.name), bank.active ? null : chip('De baja', 'neutral'))),
    rows.length ? h('dl', { class: 'kv', style: 'margin-top:12px' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : null,
    bank.notes ? h('p', { class: 'muted', style: 'margin-top:10px;white-space:pre-wrap' }, bank.notes) : null,
  );
}

function productsCard(bank, products) {
  const card = h('div', { class: 'card' });
  const list = h('div', { class: 'stack tight' });

  function render() {
    list.replaceChildren();
    if (products.length === 0) list.append(h('p', { class: 'muted' }, 'Sin productos registrados.'));
    for (const p of products) {
      const status = dueStatus(p.end_date);
      list.append(
        h(
          'div',
          { class: 'record' },
          h('div', { class: 'head' }, h('span', { class: 'strong' }, p.name), status ? chip(STATUS_LABEL[status], status) : null),
          h(
            'div',
            { class: 'muted small' },
            [p.amount != null ? fmtMoney(p.amount) : null, p.end_date ? `garantía hasta ${fmtDate(p.end_date)}` : 'sin fecha de finalización', p.project?.name ? `obra: ${p.project.name}` : null]
              .filter(Boolean)
              .join(' · '),
          ),
          p.return_requested_date ? h('div', { class: 'muted small' }, `Devolución solicitada el ${fmtDate(p.return_requested_date)}`) : null,
          p.notes ? h('p', { class: 'muted small', style: 'margin-top:4px' }, p.notes) : null,
          h(
            'div',
            { class: 'btn-row', style: 'margin-top:8px' },
            button('Editar', { small: true, variant: 'ghost', onClick: () => openProductSheet(bank, products, render, p) }),
            button('Borrar', {
              small: true,
              variant: 'danger',
              onClick: async () => {
                if (!(await confirmDialog({ title: '¿Borrar este producto?', confirmText: 'Borrar', danger: true }))) return;
                try {
                  await deleteBankProduct(p.id);
                  products.splice(products.indexOf(p), 1);
                  render();
                } catch (err) {
                  toast(friendlyError(err), 'error');
                }
              },
            }),
          ),
        ),
      );
    }
  }
  render();

  card.append(list, h('div', { style: 'margin-top:12px' }, button('Añadir producto', { variant: 'ghost', block: true, iconName: 'plus', onClick: () => openProductSheet(bank, products, render) })));
  return section('Productos', card);
}

/** Sin `existing`: añade uno nuevo. Con `existing`: lo edita (mismo formulario, precargado). */
function openProductSheet(bank, products, onSaved, existing = null) {
  return openSheet(existing ? 'Editar producto' : 'Añadir producto', (close) =>
    (async () => {
      const projects = await listProjects();
      const projectOptions = [['', 'Ninguna'], ...projects.filter((p) => p.active || p.id === existing?.project_id).map((p) => [p.id, p.name])];

      const name = textField('Nombre', 'name', { required: true, value: existing?.name ?? '', placeholder: 'Ej.: Préstamo nave industrial, Aval obra X…' });
      const amount = textField('Importe o límite (€, opcional)', 'amount', { type: 'number', inputmode: 'decimal', min: 0, step: '0.01', value: existing?.amount ?? '' });
      const endDate = textField('Fecha de finalización o de fin de garantía (opcional)', 'end_date', { type: 'date', value: existing?.end_date ?? '', hint: 'Si se pone, entra en el semáforo de la lista y el panel.' });
      const project = selectField('Obra relacionada (opcional)', 'project_id', projectOptions, { value: existing?.project_id ?? '', hint: 'Para un aval: la obra a la que garantiza. Se ve también desde la ficha de la obra.' });
      const returnRequested = textField('Solicitud de devolución (opcional)', 'return_requested_date', { type: 'date', value: existing?.return_requested_date ?? '' });
      const notes = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas (opcional)'), h('textarea', { name: 'notes' }, existing?.notes ?? ''));
      const save = button('Guardar', { type: 'submit', block: true, iconName: 'check' });
      const form = h(
        'form',
        {
          class: 'stack',
          onsubmit: async (event) => {
            event.preventDefault();
            const f = readForm(form);
            if (!f.name) return toast('Escribe el nombre del producto.', 'error');
            save.disabled = true;
            try {
              const fields = { name: f.name, amount: toNum(f.amount), end_date: f.end_date, project_id: f.project_id, return_requested_date: f.return_requested_date, notes: f.notes };
              if (existing) {
                Object.assign(existing, await updateBankProduct(existing.id, fields));
              } else {
                products.push(await addBankProduct({ ...fields, bank_id: bank.id }));
              }
              products.sort((a, b) => ((a.end_date ?? '9999') < (b.end_date ?? '9999') ? -1 : 1));
              onSaved();
              close(true);
            } catch (err) {
              toast(friendlyError(err), 'error');
              save.disabled = false;
            }
          },
        },
        name,
        amount,
        endDate,
        project,
        returnRequested,
        notes,
        save,
      );
      return form;
    })(),
  );
}
