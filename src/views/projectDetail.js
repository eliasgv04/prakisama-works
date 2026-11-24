// Ficha de la obra: datos e importe, checklist de hitos con adjuntos, proveedores asignados
// (con si han mandado su documentación), certificaciones y gastos (proveedores, subcontratas, gasoil).

import { MILESTONE_KINDS } from '../lib/constants.js';
import {
  addBankProduct,
  addCertification,
  addExpense,
  addProjectProvider,
  deleteAttachment,
  deleteBankProduct,
  deleteCertification,
  deleteExpense,
  getProject,
  listBanks,
  listBankProductsByProject,
  listMilestoneAttachments,
  listProviders,
  removeProjectProvider,
  saveMilestone,
  uploadMilestoneAttachment,
  updateBankProduct,
  updateCertification,
  updateExpense,
  updateProjectProvider,
} from '../lib/api.js';
import { productDueStatus } from '../lib/loans.js';
import { friendlyError } from '../lib/errors.js';
import { certName, fmtDate, fmtHours, fmtMoney, fmtPeriod } from '../lib/format.js';
import { todayISO } from '../lib/dates.js';
import { MAX_ATTACHMENT_BYTES, prepareAttachment } from '../lib/image.js';
import { navigate } from '../router.js';
import { accordion } from '../ui/accordion.js';
import { button, chip, icon, readForm, searchPickField, selectField, textField, toNum } from '../ui/components.js';
import { actionButton, cardActions, deleteLink, detailHead, linkButton, panel, panelText, panelValue, record, records } from '../ui/panel.js';
import { avalDateFields, avalDatesText } from '../ui/avalFields.js';
import { h, openSheet, toast } from '../ui/dom.js';

export default async function projectDetail({ params }) {
  const [data, avales, banks] = await Promise.all([getProject(params.id), listBankProductsByProject(params.id), listBanks()]);
  const { project } = data;

  // Por filas (dos tarjetas por fila en pantalla ancha, una en el móvil): aval | proveedores,
  // certificaciones | gastos, y los hitos a todo el ancho. Las tarjetas de una fila miden lo mismo.
  const grid = h(
    'div',
    { class: 'detail-grid' },
    avalCard(project, avales, banks, data.milestones.find((m) => m.kind === 'recepcion_obra')?.done_date ?? ''),
    providersCard(project, data.providers),
    certificationsCard(project, data.certifications),
    expensesCard(project, data.expenses, data.hours),
    milestonesCard(project, data.milestones),
  );
  const node = h('div', {}, heroCard(project), grid);

  return { title: project.name, hideTitle: true, wide: true, back: '/obras', tab: 'obras', node };
}

// ---------------------------------------------------------------------------

function heroCard(project) {
  return detailHead({
    iconName: 'clipboard',
    title: project.name,
    chip: project.active ? null : chip('De baja', 'neutral'),
    editLabel: 'Editar obra',
    onEdit: () => navigate(`/obras/${project.id}/editar`),
    rows: [
      ['Importe total', project.total_amount != null ? fmtMoney(project.total_amount) : null],
      ['Base imponible', project.tax_base != null ? fmtMoney(project.tax_base) : null],
      ['IVA', project.vat_rate != null ? `${project.vat_rate}%` : null],
      ['Referencia', project.reference],
      ['Inicio', project.start_date ? fmtDate(project.start_date) : null],
      [project.extended_end_date ? 'Finalización original' : 'Finalización', project.end_date ? fmtDate(project.end_date) : null],
      ['Prórroga', project.extension_amount != null ? fmtPeriod(project.extension_amount, project.extension_unit) : null],
      ['Finalización prorrogada', project.extended_end_date ? fmtDate(project.extended_end_date) : null],
    ],
    notes: project.notes,
  });
}

// ---------------------------------------------------------------------------
// Hitos: checklist fijo (9 filas sembradas al crear la obra). Sin plazos ni avisos: solo la
// fecha en que se hizo cada uno (vacía = pendiente) y un adjunto opcional.
// ---------------------------------------------------------------------------

function milestonesCard(project, milestones) {
  const order = Object.keys(MILESTONE_KINDS);
  const sorted = [...milestones].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const chipHost = h('span', {});
  const summary = h('div', {});
  // Al guardar un hito se recalcula el resumen de arriba (cuántos hechos).
  const refresh = () => {
    const done = sorted.filter((m) => m.done_date).length;
    chipHost.replaceChildren(done === sorted.length ? chip('Completo', 'ok') : chip('Pendientes', 'soon'));
    summary.replaceChildren(panelValue(`${done} de ${sorted.length}`), panelText('hitos hechos. Abre cada uno para poner la fecha, notas y adjuntos.'));
  };
  const subs = sorted.map((m) => milestoneRow(project, m, refresh));
  refresh();
  const card = panel('Hitos y documentación', chipHost, summary, h('div', { class: 'folds fold-grid' }, subs.map((sub) => sub.el)));
  card.classList.add('full');
  return card;
}

function milestoneRow(project, milestone, onSaved = () => {}) {
  const describe = (m) => ({ summary: m.done_date ? `Hecho el ${fmtDate(m.done_date)}` : 'Pendiente', warn: !m.done_date, badge: chip(m.done_date ? 'Hecho' : 'Pendiente', m.done_date ? 'ok' : 'neutral') });

  const dateInput = h('input', { type: 'date', value: milestone.done_date ?? '' });
  const notesInput = h('textarea', {}, milestone.notes ?? '');
  const attachHost = h('div', { class: 'attachments' });
  const fileInput = h('input', {
    type: 'file',
    accept: 'image/*,application/pdf',
    hidden: true,
    onchange: async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        const ready = await prepareAttachment(file);
        if (ready.size > MAX_ATTACHMENT_BYTES) throw new Error(`"${file.name}" pesa más de 10 MB.`);
        await uploadMilestoneAttachment(project.id, milestone.id, ready);
        toast('Adjunto subido', 'success');
        renderAttachments();
      } catch (err) {
        toast(friendlyError(err), 'error');
      }
    },
  });

  async function renderAttachments() {
    attachHost.replaceChildren();
    const files = await listMilestoneAttachments(milestone.id);
    for (const f of files) {
      attachHost.append(
        h(
          'a',
          { href: f.url ?? '#', target: '_blank', rel: 'noopener' },
          f.mime_type?.startsWith('image/') && f.url ? h('img', { src: f.url, alt: '', loading: 'lazy' }) : icon('file', 18),
          h('span', {}, f.file_name ?? 'Adjunto'),
          h('button', {
            type: 'button',
            class: 'icon-btn',
            style: 'width:28px;height:28px',
            'aria-label': 'Quitar adjunto',
            onclick: async (event) => {
              event.preventDefault();
              try {
                await deleteAttachment(f.id, f.storage_path);
                renderAttachments();
              } catch (err) {
                toast(friendlyError(err), 'error');
              }
            },
          }, icon('x', 14)),
        ),
      );
    }
  }
  renderAttachments();

  const save = button('Guardar', { block: true, iconName: 'check' });
  const clearBtn = milestone.done_date ? button('Quitar fecha (pendiente)', { variant: 'ghost', block: true }) : null;
  const run = async (patch) => {
    save.disabled = true;
    try {
      const updated = await saveMilestone(milestone.id, patch);
      Object.assign(milestone, updated);
      card.set(describe(milestone));
      onSaved();
      toast('Guardado', 'success');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      save.disabled = false;
    }
  };
  save.onclick = () => run({ done_date: dateInput.value || null, notes: notesInput.value.trim() || null });
  if (clearBtn) clearBtn.onclick = () => { dateInput.value = ''; run({ done_date: null }); };

  const content = h(
    'div',
    { class: 'stack' },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Fecha'), dateInput),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas'), notesInput),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Adjuntos'), attachHost, button('Añadir adjunto', { variant: 'ghost', small: true, iconName: 'camera', onClick: () => fileInput.click() }), fileInput),
    save,
    clearBtn,
  );

  const card = accordion({ group: 'hitos', sub: true, title: MILESTONE_KINDS[milestone.kind], ...describe(milestone), content });
  return card;
}

// ---------------------------------------------------------------------------
// Aval: producto bancario vinculado a la obra (banco, importe, fin de garantía, devolución).
// Se gestiona igual desde la ficha del banco (bank_products.project_id apunta aquí).
// ---------------------------------------------------------------------------

const AVAL_STATUS_LABEL = { ok: 'Al día', soon: 'Próximo', overdue: 'Vencido' };

function avalCard(project, avales, banks, receptionDefault) {
  const chipHost = h('span', {});
  const summary = h('div', {});
  const list = records();
  const card = panel('Aval', chipHost, summary, list, cardActions(actionButton('Añadir aval', 'plus', () => openAvalSheet(project, banks, avales, render, receptionDefault), '')));

  function render() {
    const statuses = avales.map((a) => productDueStatus(a)).filter(Boolean);
    const worst = ['overdue', 'soon', 'ok'].find((s) => statuses.includes(s));
    const total = avales.reduce((acc, a) => acc + Number(a.amount ?? 0), 0);
    chipHost.replaceChildren(worst ? chip(AVAL_STATUS_LABEL[worst], worst) : '');
    summary.replaceChildren(
      panelValue(avales.length ? fmtMoney(total) : null, 'Sin aval'),
      panelText(avales.length ? [...new Set(avales.map((a) => a.bank?.name).filter(Boolean))].join(', ') || `${avales.length} aval${avales.length === 1 ? '' : 'es'}` : 'Añádelo si la obra tiene aval bancario.'),
    );
    list.replaceChildren(
      ...avales.map((a) => {
        const status = productDueStatus(a);
        return record({
          title: a.name,
          aside: status ? chip(AVAL_STATUS_LABEL[status], status) : null,
          meta: [a.bank?.name, a.amount != null ? fmtMoney(a.amount) : null, ...avalDatesText(a), a.return_requested_date ? `devolución solicitada el ${fmtDate(a.return_requested_date)}` : null]
            .filter(Boolean)
            .join(' · '),
          actions: [
            linkButton('Editar', 'edit', () => openAvalSheet(project, banks, avales, render, receptionDefault, a)),
            deleteLink('este aval', () => deleteBankProduct(a.id), () => { avales.splice(avales.indexOf(a), 1); render(); }),
          ],
        });
      }),
    );
  }
  render();
  return card;
}

function openAvalSheet(project, banks, avales, onSaved, receptionDefault, existing = null) {
  return openSheet(existing ? 'Editar aval' : 'Añadir aval', (close) => {
    const activeBanks = banks.filter((b) => b.active || b.id === existing?.bank_id).map((b) => [b.id, b.name]);
    if (activeBanks.length === 0) return h('p', { class: 'muted' }, 'Primero da de alta un banco en Finanzas.');
    const bank = selectField('Banco', 'bank_id', activeBanks, { value: existing?.bank_id ?? '' });
    const name = textField('Nombre', 'name', { required: true, value: existing?.name ?? 'Aval' });
    const amount = textField('Importe (€, opcional)', 'amount', { type: 'number', inputmode: 'decimal', min: 0, step: '0.01', value: existing?.amount ?? '' });
    const dates = avalDateFields(existing, { receptionDefault });
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
          if (!f.bank_id || !f.name) return toast('Elige el banco y escribe el nombre.', 'error');
          save.disabled = true;
          try {
            const fields = { kind: 'aval', external_project: null, bank_id: f.bank_id, name: f.name, amount: toNum(f.amount), ...dates.read(), return_requested_date: f.return_requested_date, notes: f.notes, project_id: project.id };
            if (existing) {
              Object.assign(existing, await updateBankProduct(existing.id, fields));
            } else {
              avales.push(await addBankProduct(fields));
            }
            onSaved();
            close(true);
          } catch (err) {
            toast(friendlyError(err), 'error');
            save.disabled = false;
          }
        },
      },
      bank,
      name,
      amount,
      ...dates.nodes,
      returnRequested,
      notes,
      save,
    );
    return form;
  });
}

// ---------------------------------------------------------------------------
// Proveedores asignados: además, si han mandado su documentación. Plegados por defecto (como la
// formación del trabajador): cerrado solo enseña cuántos hay y cuántos deben documentación.
// ---------------------------------------------------------------------------

function providersCard(project, rows) {
  const chipHost = h('span', {});
  const summary = h('div', {});
  const list = records();
  const fold = accordion({ group: 'proveedores-obra', iconName: 'truck', title: 'Ver proveedores', content: list });
  const folds = h('div', { class: 'folds' }, fold.el);
  const card = panel('Proveedores', chipHost, summary, folds, cardActions(actionButton('Añadir proveedor', 'plus', () => openAddProviderSheet(project, rows, render), '')));

  function render() {
    folds.hidden = rows.length === 0;
    const pending = rows.filter((r) => !r.documentation_received).length;
    chipHost.replaceChildren(rows.length ? (pending ? chip('Documentación pendiente', 'soon') : chip('Documentación al día', 'ok')) : '');
    summary.replaceChildren(
      panelValue(rows.length ? `${rows.length} ${rows.length === 1 ? 'proveedor' : 'proveedores'}` : null, 'Sin proveedores'),
      panelText(rows.length ? (pending ? `${pending} sin mandar la documentación.` : 'Todos han mandado la documentación.') : 'Asigna los proveedores que trabajan en esta obra.'),
    );
    fold.set({ summary: `${rows.length} en total`, warn: pending > 0 });
    list.replaceChildren(
      ...rows.map((row) =>
        record({
          title: row.provider?.name ?? '(eliminado)',
          aside: chip(row.documentation_received ? 'Recibida' : 'Pendiente', row.documentation_received ? 'ok' : 'soon'),
          text: row.notes,
          extra: h(
            'label',
            { class: 'check' },
            h('input', {
              type: 'checkbox',
              checked: row.documentation_received,
              onchange: async (event) => {
                const checked = event.target.checked;
                try {
                  const updated = await updateProjectProvider(row.id, { documentation_received: checked, documentation_received_on: checked ? todayISO() : null });
                  Object.assign(row, updated);
                  render();
                } catch (err) {
                  event.target.checked = !checked;
                  toast(friendlyError(err), 'error');
                }
              },
            }),
            'Ha mandado la documentación',
          ),
          actions: [
            linkButton('Editar', 'edit', () => openEditProjectProviderSheet(row, render)),
            deleteLink('este proveedor de la obra', () => removeProjectProvider(row.id), () => { rows.splice(rows.indexOf(row), 1); render(); }, { label: 'Quitar' }),
          ],
        }),
      ),
    );
  }
  render();
  return card;
}

/** Asignación ya hecha: si ha mandado la documentación, en qué fecha, y notas. */
function openEditProjectProviderSheet(row, onSaved) {
  return openSheet(`Editar · ${row.provider?.name ?? 'proveedor'}`, (close) => {
    const received = h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'documentation_received', checked: row.documentation_received }), 'Ha mandado la documentación');
    const receivedOn = textField('Fecha de recepción de la documentación', 'documentation_received_on', { type: 'date', value: row.documentation_received_on ?? todayISO() });
    receivedOn.hidden = !row.documentation_received;
    received.querySelector('input').addEventListener('change', (event) => { receivedOn.hidden = !event.target.checked; });
    const notes = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas (opcional)'), h('textarea', { name: 'notes' }, row.notes ?? ''));
    const save = button('Guardar', { type: 'submit', block: true, iconName: 'check' });
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: async (event) => {
          event.preventDefault();
          const f = readForm(form);
          save.disabled = true;
          try {
            Object.assign(row, await updateProjectProvider(row.id, { documentation_received: f.documentation_received, documentation_received_on: f.documentation_received ? f.documentation_received_on : null, notes: f.notes }));
            onSaved();
            close(true);
          } catch (err) {
            toast(friendlyError(err), 'error');
            save.disabled = false;
          }
        },
      },
      received,
      receivedOn,
      notes,
      save,
    );
    return form;
  });
}

function openAddProviderSheet(project, rows, onAdded) {
  return openSheet('Añadir proveedor', (close) =>
    (async () => {
      const all = await listProviders();
      const assigned = new Set(rows.map((r) => r.provider_id));
      const options = all.filter((p) => p.active && !assigned.has(p.id)).map((p) => [p.id, p.name]);
      if (options.length === 0) return h('p', { class: 'muted' }, 'No quedan proveedores activos por asignar.');
      const select = selectField('Proveedor', 'provider_id', options);
      const save = button('Añadir', { type: 'submit', block: true, iconName: 'check' });
      return h(
        'form',
        {
          class: 'stack',
          onsubmit: async (event) => {
            event.preventDefault();
            save.disabled = true;
            try {
              const row = await addProjectProvider(project.id, readForm(event.target).provider_id);
              rows.push(row);
              onAdded();
              close(true);
            } catch (err) {
              toast(friendlyError(err), 'error');
              save.disabled = false;
            }
          },
        },
        select,
        save,
      );
    })(),
  );
}

// ---------------------------------------------------------------------------
// Certificaciones: fecha, importe y fecha de pago (vacía = pendiente de cobro). Plegadas por
// defecto, como los proveedores: cerrado enseña el total certificado y lo que falta por cobrar.
// ---------------------------------------------------------------------------

function certificationsCard(project, rows) {
  const chipHost = h('span', {});
  const summary = h('div', {});
  const list = records();
  const fold = accordion({ group: 'certificaciones-obra', iconName: 'euro', title: 'Ver certificaciones', content: list });
  const folds = h('div', { class: 'folds' }, fold.el);
  const card = panel('Certificaciones', chipHost, summary, folds, cardActions(actionButton('Añadir certificación', 'plus', () => openCertificationSheet(project, rows, render), '')));

  function render() {
    folds.hidden = rows.length === 0;
    const total = rows.reduce((acc, r) => acc + Number(r.amount), 0);
    const unpaid = rows.filter((r) => !r.payment_date);
    const unpaidTotal = unpaid.reduce((acc, r) => acc + Number(r.amount), 0);
    chipHost.replaceChildren(rows.length ? (unpaid.length ? chip('Pendiente de cobro', 'soon') : chip('Todo cobrado', 'ok')) : '');
    summary.replaceChildren(
      panelValue(rows.length ? fmtMoney(total) : null, 'Sin certificaciones'),
      panelText(rows.length ? [`${rows.length} ${rows.length === 1 ? 'certificación' : 'certificaciones'}`, unpaid.length ? `${fmtMoney(unpaidTotal)} pendiente de cobro` : 'todo cobrado'].join(' · ') : 'Todavía no se ha certificado nada.'),
    );
    fold.set({ summary: `${rows.length} en total`, warn: unpaid.length > 0 });
    list.replaceChildren(
      ...rows.map((row) =>
        record({
          title: certName(row),
          aside: chip(row.payment_date ? `Cobrada el ${fmtDate(row.payment_date)}` : 'Pendiente de cobro', row.payment_date ? 'ok' : 'soon'),
          text: row.notes,
          meta: `${fmtMoney(row.amount)} · certificada el ${fmtDate(row.cert_date)}`,
          actions: [
            linkButton('Editar', 'edit', () => openCertificationSheet(project, rows, render, row)),
            !row.payment_date
              ? linkButton('Cobrada', 'check', async () => {
                  try {
                    Object.assign(row, await updateCertification(row.id, { payment_date: todayISO() }));
                    render();
                  } catch (err) {
                    toast(friendlyError(err), 'error');
                  }
                })
              : null,
            deleteLink('esta certificación', () => deleteCertification(row.id), () => { rows.splice(rows.indexOf(row), 1); render(); }),
          ],
        }),
      ),
    );
  }
  render();
  return card;
}

/** Sin `existing`: añade una nueva. Con `existing`: la edita (mismo formulario, precargado). */
function openCertificationSheet(project, rows, onSaved, existing = null) {
  return openSheet(existing ? 'Editar certificación' : 'Añadir certificación', (close) => {
    const name = textField('Nombre', 'name', { required: true, value: existing?.name ?? '', placeholder: 'Ej.: Certificación nº 3 – octubre' });
    const date = textField('Fecha', 'cert_date', { type: 'date', required: true, value: existing?.cert_date ?? todayISO() });
    const amount = textField('Importe (€)', 'amount', { type: 'number', inputmode: 'decimal', min: 0, step: '0.01', required: true, value: existing?.amount ?? '' });
    const paid = h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'paid', checked: Boolean(existing?.payment_date) }), 'Ya está cobrada');
    const paymentDate = textField('Fecha de cobro', 'payment_date', { type: 'date', value: existing?.payment_date ?? todayISO() });
    paymentDate.hidden = !existing?.payment_date;
    paid.querySelector('input').addEventListener('change', (event) => { paymentDate.hidden = !event.target.checked; });
    const notes = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas (opcional)'), h('textarea', { name: 'notes' }, existing?.notes ?? ''));
    const save = button(existing ? 'Guardar' : 'Añadir', { type: 'submit', block: true, iconName: 'check' });
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: async (event) => {
          event.preventDefault();
          const f = readForm(form);
          if (!f.name || !f.cert_date || toNum(f.amount) == null) return toast('Rellena el nombre, la fecha y el importe.', 'error');
          save.disabled = true;
          try {
            const fields = { name: f.name, cert_date: f.cert_date, amount: toNum(f.amount), payment_date: f.paid ? f.payment_date : null, notes: f.notes };
            if (existing) Object.assign(existing, await updateCertification(existing.id, fields));
            else rows.push(await addCertification(project.id, fields));
            rows.sort((a, b) => (a.cert_date < b.cert_date ? 1 : -1));
            onSaved();
            close(true);
          } catch (err) {
            toast(friendlyError(err), 'error');
            save.disabled = false;
          }
        },
      },
      name,
      date,
      amount,
      paid,
      paymentDate,
      notes,
      save,
    );
    return form;
  });
}

// ---------------------------------------------------------------------------
// Gastos, en tres apartados plegables con su total (proveedores, subcontratas, gasoil) y el total
// de la obra debajo. Proveedor y subcontrata: mismo formulario, se busca en la lista de proveedores
// (no hace falta tenerlo asignado a la obra; desde la migración 10 las subcontratas también están
// ahí). Gasoil: kms ida y vuelta × precio por km, el importe lo calcula Postgres (migración 15).
// ---------------------------------------------------------------------------

const EXPENSE_CATEGORIES = {
  proveedor: { title: 'Proveedores', iconName: 'truck', who: 'proveedor' },
  subcontrata: { title: 'Subcontratas', iconName: 'users', who: 'subcontrata' },
  gasoil: { title: 'Gasoil', iconName: 'euro', who: 'gasoil' },
};

const sumAmounts = (rows) => rows.reduce((acc, r) => acc + Number(r.amount), 0);
const byDateDesc = (a, b) => (a.expense_date < b.expense_date ? 1 : a.expense_date > b.expense_date ? -1 : 0);
const fmtNumber = (n, digits = 2) => Number(n).toLocaleString('es-ES', { maximumFractionDigits: digits });
const round2 = (n) => Math.round(n * 100) / 100;

function expensesCard(project, rows, hours) {
  const summary = h('div', {});
  const workersCost = hours.reduce((acc, r) => acc + Number(r.total_cost ?? 0), 0);
  const renderGrandTotal = () =>
    summary.replaceChildren(panelValue(fmtMoney(sumAmounts(rows) + workersCost)), panelText('Gasto total de la obra: proveedores, subcontratas, gasoil y horas de los trabajadores.'));

  const folds = Object.keys(EXPENSE_CATEGORIES).map((category) => expenseCategoryFold(project, rows, category, renderGrandTotal));
  renderGrandTotal();
  return panel('Gastos', null, summary, h('div', { class: 'folds' }, ...folds, workersFold(hours, workersCost)));
}

/** Trabajadores: coste de las horas apuntadas en esta obra. Solo lectura: se apuntan desde "Horas". */
function workersFold(hours, workersCost) {
  const unpriced = hours.filter((r) => r.total_cost == null).length;
  const totalHours = hours.reduce((acc, r) => acc + Number(r.hours), 0);
  const list = records();
  if (hours.length === 0) list.append(panelText('Sin horas registradas en esta obra.'));
  for (const r of hours) {
    list.append(
      record({
        title: r.worker?.full_name ?? '(trabajador eliminado)',
        aside: r.total_cost != null ? fmtMoney(r.total_cost) : 'Sin precio',
        meta: [fmtDate(r.work_date), fmtHours(r.hours), r.hourly_rate != null ? `${fmtMoney(r.hourly_rate)}/h` : null].filter(Boolean).join(' · '),
      }),
    );
  }
  return accordion({
    group: 'gastos',
    sub: true,
    iconName: 'clock',
    title: 'Trabajadores',
    summary: hours.length ? [`Total: ${fmtMoney(workersCost)}`, fmtHours(totalHours), unpriced ? `${unpriced} sin precio` : null].filter(Boolean).join(' · ') : 'Sin horas',
    warn: unpriced > 0,
    content: [list, h('p', { class: 'panel-text', style: 'margin-top:12px' }, 'Se apuntan desde la pestaña Horas, con el precio por hora de cada trabajador.')],
  }).el;
}

function expenseCategoryFold(project, rows, category, onChange) {
  const cfg = EXPENSE_CATEGORIES[category];
  const isGasoil = category === 'gasoil';
  const list = records();
  const addButton = button(`Añadir gasto de ${cfg.who}`, { variant: 'ghost', small: true, block: true, iconName: 'plus', onClick: () => openExpenseSheet(project, rows, category, render) });
  const fold = accordion({ group: 'gastos', sub: true, iconName: cfg.iconName, title: cfg.title, content: [list, h('div', { style: 'margin-top:12px' }, addButton)] });

  function render() {
    const mine = rows.filter((r) => r.category === category);
    fold.set({ summary: mine.length ? `Total: ${fmtMoney(sumAmounts(mine))} · ${mine.length} ${mine.length === 1 ? 'gasto' : 'gastos'}` : 'Sin gastos' });
    list.replaceChildren();
    if (mine.length === 0) list.append(panelText('Sin gastos registrados.'));
    for (const row of mine) {
      list.append(
        record({
          title: isGasoil ? fmtDate(row.expense_date) : row.title,
          aside: fmtMoney(row.amount),
          text: row.description,
          meta: isGasoil
            ? `${fmtNumber(row.km)} km ida y vuelta × ${fmtNumber(row.km_price, 4)} €/km`
            : [row.provider?.name ?? '(eliminado)', fmtDate(row.expense_date), row.invoice_number ? `factura ${row.invoice_number}` : null].filter(Boolean).join(' · '),
          actions: [
            linkButton('Editar', 'edit', () => openExpenseSheet(project, rows, category, render, row)),
            deleteLink('este gasto', () => deleteExpense(row.id), () => { rows.splice(rows.indexOf(row), 1); render(); }),
          ],
        }),
      );
    }
    onChange();
  }
  render();
  return fold.el;
}

/** Sin `existing`: añade uno nuevo al apartado `category`. Con `existing`: lo edita (mismo formulario, precargado). */
function openExpenseSheet(project, rows, category, onSaved, existing = null) {
  const isGasoil = category === 'gasoil';
  const label = `gasto de ${EXPENSE_CATEGORIES[category].who}`;
  return openSheet(existing ? `Editar ${label}` : `Añadir ${label}`, (close) =>
    (async () => {
      const date = textField(isGasoil ? 'Día' : 'Fecha', 'expense_date', { type: 'date', required: true, value: existing?.expense_date ?? todayISO() });
      const specific = isGasoil ? gasoilFields(existing, date) : await providerExpenseFields(category, existing, date);
      if (specific.unavailable) return specific.unavailable;
      const description = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Descripción (opcional)'), h('textarea', { name: 'description' }, existing?.description ?? ''));
      const save = button(existing ? 'Guardar' : 'Añadir', { type: 'submit', block: true, iconName: 'check' });
      const form = h(
        'form',
        {
          class: 'stack',
          onsubmit: async (event) => {
            event.preventDefault();
            const f = readForm(form);
            const read = specific.read(f);
            if (typeof read === 'string') return toast(read, 'error');
            if (!f.expense_date) return toast('Indica la fecha.', 'error');
            save.disabled = true;
            try {
              const fields = { category, expense_date: f.expense_date, description: f.description, ...read };
              if (existing) Object.assign(existing, await updateExpense(existing.id, fields));
              else rows.push(await addExpense(project.id, fields));
              rows.sort(byDateDesc);
              onSaved();
              close(true);
            } catch (err) {
              toast(friendlyError(err), 'error');
              save.disabled = false;
            }
          },
        },
        ...specific.nodes,
        description,
        save,
      );
      return form;
    })(),
  );
}

/** Proveedor / subcontrata: buscador en la lista de proveedores, título, importe, fecha y nº de factura. */
async function providerExpenseFields(category, existing, date) {
  const all = await listProviders();
  const options = all.filter((p) => p.active || p.id === existing?.provider_id).map((p) => [p.id, p.name, p.nif]);
  if (options.length === 0) return { unavailable: h('p', { class: 'muted' }, 'Primero da de alta un proveedor en Listas.') };
  const who = category === 'subcontrata' ? 'Subcontrata' : 'Proveedor';
  const provider = searchPickField(who, 'provider_id', options, { value: existing?.provider_id ?? '', placeholder: 'Buscar por nombre o NIF…' });
  const title = textField('Título', 'title', { required: true, value: existing?.title ?? '' });
  const amount = textField('Importe (€)', 'amount', { type: 'number', inputmode: 'decimal', min: 0, step: '0.01', required: true, value: existing?.amount ?? '' });
  const invoiceNumber = textField('Nº de factura (opcional)', 'invoice_number', { value: existing?.invoice_number ?? '' });
  return {
    nodes: [provider, title, amount, h('div', { class: 'row2' }, date, invoiceNumber)],
    read: (f) => {
      if (!f.provider_id) return `Busca y elige la ${who.toLowerCase()} de la lista.`;
      if (!f.title || toNum(f.amount) == null) return 'Rellena el título y el importe.';
      return { provider_id: f.provider_id, title: f.title, amount: toNum(f.amount), invoice_number: f.invoice_number, km: null, km_price: null };
    },
  };
}

/** Gasoil: kms ida y vuelta × precio por km. El total se ve al momento; el que se guarda lo recalcula Postgres. */
function gasoilFields(existing, date) {
  const km = textField('Kms ida y vuelta', 'km', { type: 'number', inputmode: 'decimal', min: 0, step: '0.01', required: true, value: existing?.km ?? '' });
  const price = textField('Precio por km (€)', 'km_price', { type: 'number', inputmode: 'decimal', min: 0, step: '0.0001', required: true, value: existing?.km_price ?? '' });
  const preview = h('div', {});
  const update = () => {
    const k = toNum(km.querySelector('input').value);
    const p = toNum(price.querySelector('input').value);
    preview.replaceChildren(h('div', { class: 'muted small' }, 'Total'), h('div', { class: 'big' }, k != null && p != null ? fmtMoney(round2(k * p)) : '—'));
  };
  km.addEventListener('input', update);
  price.addEventListener('input', update);
  update();
  return {
    nodes: [date, h('div', { class: 'row2' }, km, price), preview],
    read: (f) => {
      if (toNum(f.km) == null || toNum(f.km_price) == null) return 'Rellena los kms y el precio.';
      // amount lo recalcula el trigger; se manda igualmente para cumplir el NOT NULL de la columna.
      return { provider_id: null, title: null, invoice_number: null, km: toNum(f.km), km_price: toNum(f.km_price), amount: round2(toNum(f.km) * toNum(f.km_price)) };
    },
  };
}
