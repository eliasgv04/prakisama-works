// Ficha del banco: datos de contacto y sus productos (préstamos, avales, líneas de crédito...),
// cada uno con semáforo si tiene fecha de finalización y, opcionalmente, la obra a la que garantiza
// (para los avales: se ven igual desde la obra, en su sección "Aval").

import { addBankProduct, deleteBankProduct, listBankProducts, listBanks, listProjects, updateBankProduct } from '../lib/api.js';
import { dueStatus } from '../lib/dueStatus.js';
import { friendlyError } from '../lib/errors.js';
import { fmtDate, fmtMoney } from '../lib/format.js';
import { navigate } from '../router.js';
import { button, chip, readForm, selectField, textField, toNum } from '../ui/components.js';
import { actionButton, cardActions, deleteLink, detailHead, linkButton, panel, panelText, panelValue, record, records } from '../ui/panel.js';
import { avalDateFields, avalDatesText } from '../ui/avalFields.js';
import { h, openSheet, toast } from '../ui/dom.js';

const STATUS_LABEL = { ok: 'Al día', soon: 'Próximo', overdue: 'Vencido' };

export default async function bankDetail({ params }) {
  const [bank, products] = await Promise.all([listBanks().then((all) => all.find((b) => b.id === params.id)), listBankProducts(params.id)]);
  if (!bank) throw new Error('No se encuentra este banco.');

  const node = h('div', {}, heroCard(bank), h('div', { class: 'detail-grid' }, productsCard(bank, products)));
  return { title: bank.name, hideTitle: true, back: '/bancos', tab: 'finanzas', node };
}

function heroCard(bank) {
  return detailHead({
    iconName: 'euro',
    title: bank.name,
    chip: bank.active ? null : chip('De baja', 'neutral'),
    editLabel: 'Editar banco',
    onEdit: () => navigate(`/bancos/${bank.id}/editar`),
    rows: [['Contacto', bank.contact_name], ['Teléfono', bank.phone], ['Email', bank.email]],
    notes: bank.notes,
  });
}

function productsCard(bank, products) {
  const value = h('div', {});
  const list = records();
  const card = panel('Productos', null, value, list, cardActions(actionButton('Añadir producto', 'plus', () => openProductSheet(bank, products, render), '')));

  function render() {
    const overdue = products.filter((p) => dueStatus(p.end_date) === 'overdue').length;
    const soon = products.filter((p) => dueStatus(p.end_date) === 'soon').length;
    value.replaceChildren(
      panelValue(products.length ? `${products.length} ${products.length === 1 ? 'producto' : 'productos'}` : null, 'Sin productos'),
      panelText(
        products.length
          ? [overdue ? `${overdue} vencido${overdue === 1 ? '' : 's'}` : null, soon ? `${soon} próximo${soon === 1 ? '' : 's'} a vencer` : null].filter(Boolean).join(' · ') || 'Todos al día o sin fecha de finalización.'
          : 'Préstamos, avales, líneas de crédito…',
      ),
    );
    list.replaceChildren(
      ...products.map((p) => {
        const status = dueStatus(p.end_date);
        return record({
          title: p.name,
          aside: status ? chip(STATUS_LABEL[status], status) : null,
          text: p.notes,
          meta: [
            p.amount != null ? fmtMoney(p.amount) : null,
            ...(p.end_date ? avalDatesText(p) : ['sin fecha de finalización']),
            p.project?.name ? `obra: ${p.project.name}` : null,
            p.return_requested_date ? `devolución solicitada el ${fmtDate(p.return_requested_date)}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          actions: [
            linkButton('Editar', 'edit', () => openProductSheet(bank, products, render, p)),
            deleteLink('este producto', () => deleteBankProduct(p.id), () => { products.splice(products.indexOf(p), 1); render(); }),
          ],
        });
      }),
    );
  }
  render();
  return card;
}

/** Sin `existing`: añade uno nuevo. Con `existing`: lo edita (mismo formulario, precargado). */
function openProductSheet(bank, products, onSaved, existing = null) {
  return openSheet(existing ? 'Editar producto' : 'Añadir producto', (close) =>
    (async () => {
      const projects = await listProjects();
      const projectOptions = [['', 'Ninguna'], ...projects.filter((p) => p.active || p.id === existing?.project_id).map((p) => [p.id, p.name])];

      const name = textField('Nombre', 'name', { required: true, value: existing?.name ?? '', placeholder: 'Ej.: Préstamo nave industrial, Aval obra X…' });
      const amount = textField('Importe o límite (€, opcional)', 'amount', { type: 'number', inputmode: 'decimal', min: 0, step: '0.01', value: existing?.amount ?? '' });
      const dates = avalDateFields(existing, { manualEnd: true });
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
              const fields = { name: f.name, amount: toNum(f.amount), ...dates.read(), project_id: f.project_id, return_requested_date: f.return_requested_date, notes: f.notes };
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
        project,
        ...dates.nodes,
        returnRequested,
        notes,
        save,
      );
      return form;
    })(),
  );
}
