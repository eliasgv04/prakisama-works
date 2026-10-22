// Ficha de la obra: datos e importe, checklist de hitos con adjuntos, proveedores asignados
// (con si han mandado su documentación), certificaciones y gastos.

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
import { dueStatus } from '../lib/dueStatus.js';
import { friendlyError } from '../lib/errors.js';
import { fmtDate, fmtMoney, fmtPeriod } from '../lib/format.js';
import { todayISO } from '../lib/dates.js';
import { MAX_ATTACHMENT_BYTES, prepareAttachment } from '../lib/image.js';
import { navigate } from '../router.js';
import { accordion } from '../ui/accordion.js';
import { button, chip, icon, iconButton, readForm, searchPickField, section, selectField, textField, toNum } from '../ui/components.js';
import { avalDateFields, avalDatesText } from '../ui/avalFields.js';
import { confirmDialog, h, openSheet, toast } from '../ui/dom.js';

export default async function projectDetail({ params }) {
  const [data, avales, banks] = await Promise.all([getProject(params.id), listBankProductsByProject(params.id), listBanks()]);
  const { project } = data;

  const left = h('div', { class: 'col' });
  const right = h('div', { class: 'col' });
  const node = h('div', { class: 'detail-grid' }, left, right);

  left.append(heroCard(project), milestonesCard(project, data.milestones), avalCard(project, avales, banks, data.milestones.find((m) => m.kind === 'recepcion_obra')?.done_date ?? ''));
  right.append(providersCard(project, data.providers), certificationsCard(project, data.certifications), expensesCard(project, data.expenses));
  right.append(h('div', { class: 'spacer' }), button('Editar obra', { variant: 'ghost', block: true, iconName: 'edit', onClick: () => navigate(`/obras/${project.id}/editar`) }));

  return { title: project.name, hideTitle: true, wide: true, back: '/obras', tab: 'obras', node };
}

// ---------------------------------------------------------------------------

function heroCard(project) {
  const rows = [
    ['Referencia', project.reference],
    ['Inicio', project.start_date ? fmtDate(project.start_date) : null],
    [project.extended_end_date ? 'Finalización original' : 'Finalización', project.end_date ? fmtDate(project.end_date) : null],
    ['Prórroga', project.extension_amount != null ? fmtPeriod(project.extension_amount, project.extension_unit) : null],
    ['Finalización prorrogada', project.extended_end_date ? fmtDate(project.extended_end_date) : null],
    ['Base imponible', project.tax_base != null ? fmtMoney(project.tax_base) : null],
    ['IVA', project.vat_rate != null ? `${project.vat_rate}%` : null],
  ].filter(([, value]) => value);

  return h(
    'div',
    { class: 'card' },
    h(
      'div',
      { class: 'hero' },
      h('div', { class: 'thumb' }, icon('clipboard', 30)),
      h('div', { class: 'grow' }, h('h2', {}, project.name), project.active ? null : chip('De baja', 'neutral')),
      iconButton('edit', 'Editar obra', () => navigate(`/obras/${project.id}/editar`)),
    ),
    h('div', { class: 'spacer' }),
    project.total_amount != null ? h('div', {}, h('div', { class: 'muted small' }, 'Importe total'), h('div', { class: 'big' }, fmtMoney(project.total_amount))) : null,
    rows.length ? h('dl', { class: 'kv', style: 'margin-top:12px' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : null,
    project.notes ? h('p', { class: 'muted', style: 'margin-top:10px;white-space:pre-wrap' }, project.notes) : null,
  );
}

// ---------------------------------------------------------------------------
// Hitos: checklist fijo (9 filas sembradas al crear la obra). Sin plazos ni avisos: solo la
// fecha en que se hizo cada uno (vacía = pendiente) y un adjunto opcional.
// ---------------------------------------------------------------------------

function milestonesCard(project, milestones) {
  const order = Object.keys(MILESTONE_KINDS);
  const sorted = [...milestones].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const done = sorted.filter((m) => m.done_date).length;
  const subs = sorted.map((m) => milestoneRow(project, m));
  const card = accordion({
    group: 'top',
    iconName: 'file',
    title: 'Hitos y documentación',
    summary: `${done} de ${sorted.length} hechos`,
    warn: done < sorted.length,
    content: subs.map((s) => s.el),
  });
  return section('Hitos y documentación', card.el);
}

function milestoneRow(project, milestone) {
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
  const card = h('div', { class: 'card' });
  const list = h('div', { class: 'stack tight' });

  function render() {
    list.replaceChildren();
    if (avales.length === 0) list.append(h('p', { class: 'muted' }, 'Sin aval registrado.'));
    for (const a of avales) {
      const status = dueStatus(a.end_date);
      list.append(
        h(
          'div',
          { class: 'record' },
          h('div', { class: 'head' }, h('span', { class: 'strong' }, a.name), status ? chip(AVAL_STATUS_LABEL[status], status) : null),
          h(
            'div',
            { class: 'muted small' },
            [a.bank?.name, a.amount != null ? fmtMoney(a.amount) : null, ...avalDatesText(a)].filter(Boolean).join(' · '),
          ),
          a.return_requested_date ? h('div', { class: 'muted small' }, `Devolución solicitada el ${fmtDate(a.return_requested_date)}`) : null,
          h(
            'div',
            { class: 'btn-row', style: 'margin-top:8px' },
            button('Editar', { small: true, variant: 'ghost', onClick: () => openAvalSheet(project, banks, avales, render, receptionDefault, a) }),
            button('Borrar', {
              small: true,
              variant: 'danger',
              onClick: async () => {
                if (!(await confirmDialog({ title: '¿Borrar este aval?', confirmText: 'Borrar', danger: true }))) return;
                try {
                  await deleteBankProduct(a.id);
                  avales.splice(avales.indexOf(a), 1);
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

  card.append(list, h('div', { style: 'margin-top:12px' }, button('Añadir aval', { variant: 'ghost', block: true, iconName: 'plus', onClick: () => openAvalSheet(project, banks, avales, render, receptionDefault) })));
  return section('Aval', card);
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
            const fields = { bank_id: f.bank_id, name: f.name, amount: toNum(f.amount), ...dates.read(), return_requested_date: f.return_requested_date, notes: f.notes, project_id: project.id };
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
// Proveedores asignados: además, si han mandado su documentación
// ---------------------------------------------------------------------------

function providersCard(project, rows) {
  const card = h('div', { class: 'card' });
  const list = h('div', { class: 'stack tight' });
  function render() {
    list.replaceChildren();
    if (rows.length === 0) list.append(h('p', { class: 'muted' }, 'Sin proveedores asignados.'));
    for (const row of rows) {
      const docChip = chip(row.documentation_received ? 'Documentación recibida' : 'Documentación pendiente', row.documentation_received ? 'ok' : 'soon');
      list.append(
        h(
          'div',
          { class: 'record' },
          h(
            'div',
            { class: 'head' },
            h('span', { class: 'strong' }, row.provider?.name ?? '(eliminado)'),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitar', onclick: async () => {
              try {
                await removeProjectProvider(row.id);
                rows.splice(rows.indexOf(row), 1);
                render();
              } catch (err) {
                toast(friendlyError(err), 'error');
              }
            } }, icon('x', 18)),
          ),
          h('div', { style: 'margin-top:6px' }, docChip),
          h(
            'label',
            { class: 'check', style: 'margin-top:8px' },
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
          row.notes ? h('p', { class: 'muted small', style: 'margin-top:4px' }, row.notes) : null,
          h('div', { class: 'btn-row', style: 'margin-top:8px' }, button('Editar', { small: true, variant: 'ghost', onClick: () => openEditProjectProviderSheet(row, render) })),
        ),
      );
    }
  }
  render();
  card.append(list, h('div', { style: 'margin-top:12px' }, button('Añadir proveedor', { variant: 'ghost', block: true, iconName: 'plus', onClick: () => openAddProviderSheet(project, rows, render) })));
  return section('Proveedores', card);
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
// Certificaciones: fecha, importe y fecha de pago (vacía = pendiente de cobro)
// ---------------------------------------------------------------------------

function certificationsCard(project, rows) {
  const card = h('div', { class: 'card' });
  const list = h('div', { class: 'stack tight' });
  function render() {
    list.replaceChildren();
    if (rows.length === 0) list.append(h('p', { class: 'muted' }, 'Sin certificaciones registradas.'));
    for (const row of rows) {
      list.append(
        h(
          'div',
          { class: 'record' },
          h('div', { class: 'head' }, h('span', { class: 'strong' }, fmtMoney(row.amount)), h('span', { class: 'muted small' }, fmtDate(row.cert_date))),
          h('div', { style: 'margin-top:6px' }, chip(row.payment_date ? `Cobrada el ${fmtDate(row.payment_date)}` : 'Pendiente de cobro', row.payment_date ? 'ok' : 'soon')),
          row.notes ? h('p', { class: 'muted small', style: 'margin-top:4px' }, row.notes) : null,
          h(
            'div',
            { class: 'btn-row', style: 'margin-top:8px' },
            button('Editar', { small: true, variant: 'ghost', onClick: () => openCertificationSheet(project, rows, render, row) }),
            !row.payment_date
              ? button('Marcar cobrada', { small: true, variant: 'ghost', onClick: async () => {
                  try {
                    Object.assign(row, await updateCertification(row.id, { payment_date: todayISO() }));
                    render();
                  } catch (err) {
                    toast(friendlyError(err), 'error');
                  }
                } })
              : null,
            button('Borrar', { small: true, variant: 'danger', onClick: async () => {
              if (!(await confirmDialog({ title: '¿Borrar esta certificación?', confirmText: 'Borrar', danger: true }))) return;
              try {
                await deleteCertification(row.id);
                rows.splice(rows.indexOf(row), 1);
                render();
              } catch (err) {
                toast(friendlyError(err), 'error');
              }
            } }),
          ),
        ),
      );
    }
  }
  render();
  card.append(list, h('div', { style: 'margin-top:12px' }, button('Añadir certificación', { variant: 'ghost', block: true, iconName: 'plus', onClick: () => openCertificationSheet(project, rows, render) })));
  return section('Certificaciones', card);
}

/** Sin `existing`: añade una nueva. Con `existing`: la edita (mismo formulario, precargado). */
function openCertificationSheet(project, rows, onSaved, existing = null) {
  return openSheet(existing ? 'Editar certificación' : 'Añadir certificación', (close) => {
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
          if (!f.cert_date || toNum(f.amount) == null) return toast('Rellena la fecha y el importe.', 'error');
          save.disabled = true;
          try {
            const fields = { cert_date: f.cert_date, amount: toNum(f.amount), payment_date: f.paid ? f.payment_date : null, notes: f.notes };
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
// Gastos: de un proveedor cualquiera (no hace falta tenerlo asignado a la obra), con buscador
// ---------------------------------------------------------------------------

function expensesCard(project, rows) {
  const card = h('div', { class: 'card' });
  const total = h('div', {});
  const list = h('div', { class: 'stack tight' });
  function render() {
    total.replaceChildren();
    if (rows.length) {
      const sum = rows.reduce((acc, r) => acc + Number(r.amount), 0);
      total.append(h('div', { class: 'muted small' }, `Total gastos (${rows.length})`), h('div', { class: 'big', style: 'margin-bottom:12px' }, fmtMoney(sum)));
    }
    list.replaceChildren();
    if (rows.length === 0) list.append(h('p', { class: 'muted' }, 'Sin gastos registrados.'));
    for (const row of rows) {
      list.append(
        h(
          'div',
          { class: 'record' },
          h('div', { class: 'head' }, h('span', { class: 'strong' }, row.title), h('span', { class: 'strong' }, fmtMoney(row.amount))),
          h('div', { class: 'muted small' }, [row.provider?.name ?? '(eliminado)', fmtDate(row.expense_date)].join(' · ')),
          row.description ? h('p', { class: 'muted small', style: 'margin-top:4px;white-space:pre-wrap' }, row.description) : null,
          h(
            'div',
            { class: 'btn-row', style: 'margin-top:8px' },
            button('Editar', { small: true, variant: 'ghost', onClick: () => openExpenseSheet(project, rows, render, row) }),
            button('Borrar', { small: true, variant: 'danger', onClick: async () => {
              if (!(await confirmDialog({ title: '¿Borrar este gasto?', confirmText: 'Borrar', danger: true }))) return;
              try {
                await deleteExpense(row.id);
                rows.splice(rows.indexOf(row), 1);
                render();
              } catch (err) {
                toast(friendlyError(err), 'error');
              }
            } }),
          ),
        ),
      );
    }
  }
  render();
  card.append(total, list, h('div', { style: 'margin-top:12px' }, button('Añadir gasto', { variant: 'ghost', block: true, iconName: 'plus', onClick: () => openExpenseSheet(project, rows, render) })));
  return section('Gastos', card);
}

/** Sin `existing`: añade uno nuevo. Con `existing`: lo edita (mismo formulario, precargado). */
function openExpenseSheet(project, rows, onSaved, existing = null) {
  return openSheet(existing ? 'Editar gasto' : 'Añadir gasto', (close) =>
    (async () => {
      const all = await listProviders();
      const options = all.filter((p) => p.active || p.id === existing?.provider_id).map((p) => [p.id, p.name, p.nif]);
      if (options.length === 0) return h('p', { class: 'muted' }, 'Primero da de alta un proveedor en Listas.');
      const provider = searchPickField('Proveedor', 'provider_id', options, { value: existing?.provider_id ?? '', placeholder: 'Buscar por nombre o NIF…' });
      const title = textField('Título', 'title', { required: true, value: existing?.title ?? '' });
      const amount = textField('Importe (€)', 'amount', { type: 'number', inputmode: 'decimal', min: 0, step: '0.01', required: true, value: existing?.amount ?? '' });
      const date = textField('Fecha', 'expense_date', { type: 'date', required: true, value: existing?.expense_date ?? todayISO() });
      const description = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Descripción (opcional)'), h('textarea', { name: 'description' }, existing?.description ?? ''));
      const save = button(existing ? 'Guardar' : 'Añadir', { type: 'submit', block: true, iconName: 'check' });
      const form = h(
        'form',
        {
          class: 'stack',
          onsubmit: async (event) => {
            event.preventDefault();
            const f = readForm(form);
            if (!f.provider_id) return toast('Busca y elige el proveedor de la lista.', 'error');
            if (!f.title || toNum(f.amount) == null || !f.expense_date) return toast('Rellena el título, el importe y la fecha.', 'error');
            save.disabled = true;
            try {
              const fields = { provider_id: f.provider_id, title: f.title, description: f.description, amount: toNum(f.amount), expense_date: f.expense_date };
              if (existing) Object.assign(existing, await updateExpense(existing.id, fields));
              else rows.push(await addExpense(project.id, fields));
              rows.sort((a, b) => (a.expense_date < b.expense_date ? 1 : a.expense_date > b.expense_date ? -1 : 0));
              onSaved();
              close(true);
            } catch (err) {
              toast(friendlyError(err), 'error');
              save.disabled = false;
            }
          },
        },
        provider,
        title,
        amount,
        date,
        description,
        save,
      );
      return form;
    })(),
  );
}
