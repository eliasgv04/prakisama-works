// Ficha del trabajador: datos básicos, reconocimiento médico (con semáforo), formación (con
// certificado adjunto) y vacaciones.

import {
  addMedicalCheckup,
  addTraining,
  addVacation,
  deleteAttachment,
  deleteMedicalCheckup,
  deleteTraining,
  deleteVacation,
  listMedicalCheckups,
  listTrainingAttachments,
  listTrainings,
  listVacations,
  listWorkers,
  updateMedicalCheckup,
  updateTraining,
  updateVacation,
  uploadTrainingAttachment,
} from '../lib/api.js';
import { todayISO } from '../lib/dates.js';
import { friendlyError } from '../lib/errors.js';
import { fmtDate, fmtMoney } from '../lib/format.js';
import { MAX_ATTACHMENT_BYTES, prepareAttachment } from '../lib/image.js';
import { dueStatus } from '../lib/dueStatus.js';
import { navigate } from '../router.js';
import { accordion } from '../ui/accordion.js';
import { button, chip, icon, iconButton, readForm, section, textField } from '../ui/components.js';
import { confirmDialog, h, openSheet, toast } from '../ui/dom.js';

const STATUS_LABEL = { ok: 'Al día', soon: 'Próximo', overdue: 'Vencido' };

export default async function workerDetail({ params }) {
  const [worker, checkups, trainings, vacations] = await Promise.all([
    listWorkers().then((all) => all.find((w) => w.id === params.id)),
    listMedicalCheckups(params.id),
    listTrainings(params.id),
    listVacations(params.id),
  ]);
  if (!worker) throw new Error('No se encuentra este trabajador.');

  const left = h('div', { class: 'col' });
  const right = h('div', { class: 'col' });
  const node = h('div', { class: 'detail-grid' }, left, right);

  left.append(heroCard(worker), medicalCard(worker, checkups));
  right.append(trainingsCard(worker, trainings), vacationsCard(worker, vacations));
  right.append(h('div', { class: 'spacer' }), button('Editar trabajador', { variant: 'ghost', block: true, iconName: 'edit', onClick: () => navigate(`/trabajadores/${worker.id}/editar`) }));

  return { title: worker.full_name, hideTitle: true, wide: true, back: '/trabajadores', tab: 'listas', node };
}

// ---------------------------------------------------------------------------

function heroCard(worker) {
  const rows = [
    ['DNI/NIF', worker.nif],
    ['Teléfono', worker.phone],
    ['Categoría', worker.role],
    ['Nº afiliación S.S.', worker.social_security_number],
    ['Número de cuenta', worker.account_number],
    ['Precio por hora', worker.hourly_rate != null ? `${fmtMoney(worker.hourly_rate)}/h` : null],
  ].filter(([, v]) => v);
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'hero' }, h('div', { class: 'thumb' }, icon('users', 30)), h('div', { class: 'grow' }, h('h2', {}, worker.full_name), worker.active ? null : chip('De baja', 'neutral')), iconButton('edit', 'Editar trabajador', () => navigate(`/trabajadores/${worker.id}/editar`))),
    rows.length ? h('dl', { class: 'kv', style: 'margin-top:12px' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : null,
    worker.notes ? h('p', { class: 'muted', style: 'margin-top:10px;white-space:pre-wrap' }, worker.notes) : null,
  );
}

// ---------------------------------------------------------------------------
// Reconocimiento médico: única fecha con semáforo del personal
// ---------------------------------------------------------------------------

function medicalCard(worker, checkups) {
  const card = h('div', { class: 'card' });
  const list = h('div', { class: 'stack tight' });

  function render() {
    const latest = checkups[0] ?? null;
    const status = latest ? dueStatus(latest.valid_until) : null;
    card.querySelector('.medical-summary')?.remove();
    const summary = h(
      'div',
      { class: 'medical-summary' },
      latest
        ? h(
            'div',
            { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px' },
            h('div', {}, h('div', { class: 'muted small' }, 'Último reconocimiento'), h('div', { class: 'big' }, fmtDate(latest.checkup_date))),
            status ? chip(STATUS_LABEL[status], status) : null,
          )
        : h('p', { class: 'muted' }, 'Sin reconocimientos registrados.'),
      latest?.valid_until ? h('p', { class: 'muted small', style: 'margin-top:4px' }, `Vence el ${fmtDate(latest.valid_until)}`) : null,
    );
    card.prepend(summary);

    list.replaceChildren();
    for (const c of checkups) {
      list.append(
        h(
          'div',
          { class: 'record' },
          h('div', { class: 'head' }, h('span', { class: 'strong' }, fmtDate(c.checkup_date)), h('span', { class: 'muted small' }, c.valid_until ? `hasta ${fmtDate(c.valid_until)}` : 'sin vencimiento')),
          c.notes ? h('p', { class: 'muted small', style: 'margin-top:4px' }, c.notes) : null,
          h(
            'div',
            { class: 'btn-row', style: 'margin-top:8px' },
            button('Editar', { small: true, variant: 'ghost', onClick: () => openCheckupSheet(worker, checkups, render, c) }),
            button('Borrar', {
              small: true,
              variant: 'danger',
              onClick: async () => {
                if (!(await confirmDialog({ title: '¿Borrar este reconocimiento?', confirmText: 'Borrar', danger: true }))) return;
                try {
                  await deleteMedicalCheckup(c.id);
                  checkups.splice(checkups.indexOf(c), 1);
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

  card.append(list, h('div', { style: 'margin-top:12px' }, button('Registrar reconocimiento', { variant: 'ghost', block: true, iconName: 'plus', onClick: () => openCheckupSheet(worker, checkups, render) })));
  return section('Reconocimiento médico', card);
}

/** Sin `existing`: registra uno nuevo. Con `existing`: lo edita (mismo formulario, precargado). */
function openCheckupSheet(worker, checkups, onSaved, existing = null) {
  return openSheet(existing ? 'Editar reconocimiento médico' : 'Registrar reconocimiento médico', (close) => {
    const date = textField('Fecha', 'checkup_date', { type: 'date', required: true, value: existing?.checkup_date ?? todayISO() });
    const validUntil = textField('Vencimiento (opcional)', 'valid_until', { type: 'date', value: existing?.valid_until ?? '', hint: 'Si se sabe cuándo caduca, entra en el semáforo de la lista y el panel.' });
    const notes = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas (opcional)'), h('textarea', { name: 'notes' }, existing?.notes ?? ''));
    const save = button('Guardar', { type: 'submit', block: true, iconName: 'check' });
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: async (event) => {
          event.preventDefault();
          const f = readForm(form);
          if (!f.checkup_date) return toast('Indica la fecha.', 'error');
          save.disabled = true;
          try {
            const fields = { checkup_date: f.checkup_date, valid_until: f.valid_until, notes: f.notes };
            if (existing) Object.assign(existing, await updateMedicalCheckup(existing.id, fields));
            else checkups.push(await addMedicalCheckup({ ...fields, worker_id: worker.id }));
            checkups.sort((a, b) => (a.checkup_date < b.checkup_date ? 1 : -1));
            onSaved();
            close(true);
          } catch (err) {
            toast(friendlyError(err), 'error');
            save.disabled = false;
          }
        },
      },
      date,
      validUntil,
      notes,
      save,
    );
    return form;
  });
}

// ---------------------------------------------------------------------------
// Formación: historial simple con certificado adjunto opcional
// ---------------------------------------------------------------------------

// Plegada por defecto: hay trabajadores (p. ej. administrativas) con muchas formaciones y la lista
// abierta hacía la ficha larguísima. Cerrada solo enseña cuántas hay y la más reciente.
function trainingsCard(worker, trainings) {
  const card = h('div', { class: 'card' });
  const list = h('div', { class: 'stack tight' });
  const empty = h('p', { class: 'muted' }, 'Sin formación registrada.');
  const fold = accordion({ group: 'formacion', iconName: 'file', title: 'Formaciones', content: list });

  async function render() {
    empty.hidden = trainings.length > 0;
    fold.el.hidden = trainings.length === 0;
    const latest = trainings[0];
    fold.set({ summary: latest ? `${trainings.length} en total · última: ${latest.name} (${fmtDate(latest.training_date)})` : '' });
    list.replaceChildren();
    for (const t of trainings) {
      const row = h(
        'div',
        { class: 'record' },
        h('div', { class: 'head' }, h('span', { class: 'strong' }, t.name), h('span', { class: 'muted small' }, fmtDate(t.training_date))),
        t.notes ? h('p', { class: 'muted small', style: 'margin-top:4px' }, t.notes) : null,
        h('div', { class: 'attachments' }),
        h(
          'div',
          { class: 'btn-row', style: 'margin-top:8px' },
          button('Editar', { small: true, variant: 'ghost', onClick: () => openTrainingSheet(worker, trainings, render, t) }),
          button('Borrar', {
            small: true,
            variant: 'danger',
            onClick: async () => {
              if (!(await confirmDialog({ title: '¿Borrar esta formación?', message: 'También se borrará su certificado adjunto.', confirmText: 'Borrar', danger: true }))) return;
              try {
                await deleteTraining(t.id);
                trainings.splice(trainings.indexOf(t), 1);
                render();
              } catch (err) {
                toast(friendlyError(err), 'error');
              }
            },
          }),
        ),
      );
      list.append(row);
      listTrainingAttachments(t.id).then((files) => {
        const box = row.querySelector('.attachments');
        for (const f of files) {
          box.append(
            h(
              'a',
              { href: f.url ?? '#', target: '_blank', rel: 'noopener' },
              f.mime_type?.startsWith('image/') && f.url ? h('img', { src: f.url, alt: '', loading: 'lazy' }) : icon('file', 18),
              h('span', {}, f.file_name ?? 'Certificado'),
              h('button', {
                type: 'button',
                class: 'icon-btn',
                style: 'width:28px;height:28px',
                'aria-label': 'Quitar certificado',
                onclick: async (event) => {
                  event.preventDefault();
                  try {
                    await deleteAttachment(f.id, f.storage_path);
                    render();
                  } catch (err) {
                    toast(friendlyError(err), 'error');
                  }
                },
              }, icon('x', 14)),
            ),
          );
        }
      });
    }
  }
  render();

  card.append(empty, fold.el, h('div', { style: 'margin-top:12px' }, button('Añadir formación', { variant: 'ghost', block: true, iconName: 'plus', onClick: () => openTrainingSheet(worker, trainings, render) })));
  return section('Formación', card);
}

/** Sin `existing`: añade una nueva. Con `existing`: la edita; el archivo elegido se suma a sus certificados. */
function openTrainingSheet(worker, trainings, onSaved, existing = null) {
  return openSheet(existing ? 'Editar formación' : 'Añadir formación', (close) => {
    const date = textField('Fecha', 'training_date', { type: 'date', required: true, value: existing?.training_date ?? todayISO() });
    const name = textField('Nombre del curso', 'name', { required: true, value: existing?.name ?? '', placeholder: 'Ej.: PRL 20 horas' });
    const notes = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas (opcional)'), h('textarea', { name: 'notes' }, existing?.notes ?? ''));
    let file = null;
    const fileLabel = h('span', { class: 'muted small' }, 'Sin archivo');
    const fileInput = h('input', {
      type: 'file',
      accept: 'image/*,application/pdf',
      hidden: true,
      onchange: (event) => { file = event.target.files?.[0] ?? null; fileLabel.textContent = file ? file.name : 'Sin archivo'; },
    });
    const save = button('Guardar', { type: 'submit', block: true, iconName: 'check' });
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: async (event) => {
          event.preventDefault();
          const f = readForm(form);
          if (!f.training_date || !f.name) return toast('Indica la fecha y el nombre del curso.', 'error');
          save.disabled = true;
          try {
            const fields = { training_date: f.training_date, name: f.name, notes: f.notes };
            const row = existing ? Object.assign(existing, await updateTraining(existing.id, fields)) : await addTraining({ ...fields, worker_id: worker.id });
            if (file) {
              try {
                const ready = await prepareAttachment(file);
                if (ready.size > MAX_ATTACHMENT_BYTES) throw new Error(`"${file.name}" pesa más de 10 MB.`);
                await uploadTrainingAttachment(worker.id, row.id, ready);
              } catch (err) {
                toast(`Formación guardada, pero el adjunto falló: ${friendlyError(err)}`, 'error', 6000);
              }
            }
            if (!existing) trainings.push(row);
            trainings.sort((a, b) => (a.training_date < b.training_date ? 1 : -1));
            onSaved();
            close(true);
          } catch (err) {
            toast(friendlyError(err), 'error');
            save.disabled = false;
          }
        },
      },
      date,
      name,
      notes,
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, existing ? 'Añadir otro certificado (opcional)' : 'Certificado (opcional)'), h('div', { class: 'btn-row' }, button('Elegir archivo', { variant: 'ghost', small: true, iconName: 'camera', onClick: () => fileInput.click() }), fileLabel), fileInput),
      save,
    );
    return form;
  });
}

// ---------------------------------------------------------------------------
// Vacaciones: periodos, sin cálculo de saldo
// ---------------------------------------------------------------------------

function vacationsCard(worker, vacations) {
  const card = h('div', { class: 'card' });
  const list = h('div', { class: 'stack tight' });
  const today = todayISO();

  function render() {
    list.replaceChildren();
    if (vacations.length === 0) list.append(h('p', { class: 'muted' }, 'Sin periodos registrados.'));
    for (const v of vacations) {
      const current = v.start_date <= today && today <= v.end_date;
      list.append(
        h(
          'div',
          { class: 'record' },
          h('div', { class: 'head' }, h('span', { class: 'strong' }, `${fmtDate(v.start_date)} – ${fmtDate(v.end_date)}`), current ? chip('En curso', 'soon') : null),
          v.notes ? h('p', { class: 'muted small', style: 'margin-top:4px' }, v.notes) : null,
          h(
            'div',
            { class: 'btn-row', style: 'margin-top:8px' },
            button('Editar', { small: true, variant: 'ghost', onClick: () => openVacationSheet(worker, vacations, render, v) }),
            button('Borrar', {
              small: true,
              variant: 'danger',
              onClick: async () => {
                if (!(await confirmDialog({ title: '¿Borrar este periodo?', confirmText: 'Borrar', danger: true }))) return;
                try {
                  await deleteVacation(v.id);
                  vacations.splice(vacations.indexOf(v), 1);
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

  card.append(list, h('div', { style: 'margin-top:12px' }, button('Añadir periodo', { variant: 'ghost', block: true, iconName: 'plus', onClick: () => openVacationSheet(worker, vacations, render) })));
  return section('Vacaciones', card);
}

function openVacationSheet(worker, vacations, onSaved, existing = null) {
  return openSheet(existing ? 'Editar periodo de vacaciones' : 'Añadir periodo de vacaciones', (close) => {
    const start = textField('Inicio', 'start_date', { type: 'date', required: true, value: existing?.start_date ?? todayISO() });
    const end = textField('Fin', 'end_date', { type: 'date', required: true, value: existing?.end_date ?? todayISO() });
    const notes = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas (opcional)'), h('textarea', { name: 'notes' }, existing?.notes ?? ''));
    const save = button('Guardar', { type: 'submit', block: true, iconName: 'check' });
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: async (event) => {
          event.preventDefault();
          const f = readForm(form);
          if (!f.start_date || !f.end_date) return toast('Indica el inicio y el fin.', 'error');
          if (f.end_date < f.start_date) return toast('El fin no puede ser antes que el inicio.', 'error');
          save.disabled = true;
          try {
            const fields = { start_date: f.start_date, end_date: f.end_date, notes: f.notes };
            if (existing) Object.assign(existing, await updateVacation(existing.id, fields));
            else vacations.push(await addVacation({ ...fields, worker_id: worker.id }));
            vacations.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
            onSaved();
            close(true);
          } catch (err) {
            toast(friendlyError(err), 'error');
            save.disabled = false;
          }
        },
      },
      start,
      end,
      notes,
      save,
    );
    return form;
  });
}
