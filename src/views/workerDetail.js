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
  uploadTrainingAttachment,
} from '../lib/api.js';
import { todayISO } from '../lib/dates.js';
import { friendlyError } from '../lib/errors.js';
import { fmtDate } from '../lib/format.js';
import { MAX_ATTACHMENT_BYTES, prepareAttachment } from '../lib/image.js';
import { dueStatus } from '../lib/dueStatus.js';
import { navigate } from '../router.js';
import { button, chip, icon, readForm, section, textField } from '../ui/components.js';
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
  ].filter(([, v]) => v);
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'hero' }, h('div', { class: 'thumb' }, icon('users', 30)), h('div', { class: 'grow' }, h('h2', {}, worker.full_name), worker.active ? null : chip('De baja', 'neutral'))),
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
            { style: 'margin-top:8px' },
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

  card.append(list, h('div', { style: 'margin-top:12px' }, button('Registrar reconocimiento', { variant: 'ghost', block: true, iconName: 'plus', onClick: () => openAddCheckupSheet(worker, checkups, render) })));
  return section('Reconocimiento médico', card);
}

function openAddCheckupSheet(worker, checkups, onAdded) {
  return openSheet('Registrar reconocimiento médico', (close) => {
    const date = textField('Fecha', 'checkup_date', { type: 'date', required: true, value: todayISO() });
    const validUntil = textField('Vencimiento (opcional)', 'valid_until', { type: 'date', hint: 'Si se sabe cuándo caduca, entra en el semáforo de la lista y el panel.' });
    const notes = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas (opcional)'), h('textarea', { name: 'notes' }));
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
            const row = await addMedicalCheckup({ worker_id: worker.id, checkup_date: f.checkup_date, valid_until: f.valid_until, notes: f.notes });
            checkups.unshift(row);
            checkups.sort((a, b) => (a.checkup_date < b.checkup_date ? 1 : -1));
            onAdded();
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

function trainingsCard(worker, trainings) {
  const card = h('div', { class: 'card' });
  const list = h('div', { class: 'stack tight' });

  async function render() {
    list.replaceChildren();
    if (trainings.length === 0) list.append(h('p', { class: 'muted' }, 'Sin formación registrada.'));
    for (const t of trainings) {
      const row = h(
        'div',
        { class: 'record' },
        h('div', { class: 'head' }, h('span', { class: 'strong' }, t.name), h('span', { class: 'muted small' }, fmtDate(t.training_date))),
        t.notes ? h('p', { class: 'muted small', style: 'margin-top:4px' }, t.notes) : null,
        h('div', { class: 'attachments' }),
        h(
          'div',
          { style: 'margin-top:8px' },
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

  card.append(list, h('div', { style: 'margin-top:12px' }, button('Añadir formación', { variant: 'ghost', block: true, iconName: 'plus', onClick: () => openAddTrainingSheet(worker, trainings, render) })));
  return section('Formación', card);
}

function openAddTrainingSheet(worker, trainings, onAdded) {
  return openSheet('Añadir formación', (close) => {
    const date = textField('Fecha', 'training_date', { type: 'date', required: true, value: todayISO() });
    const name = textField('Nombre del curso', 'name', { required: true, placeholder: 'Ej.: PRL 20 horas' });
    const notes = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas (opcional)'), h('textarea', { name: 'notes' }));
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
            const row = await addTraining({ worker_id: worker.id, training_date: f.training_date, name: f.name, notes: f.notes });
            if (file) {
              try {
                const ready = await prepareAttachment(file);
                if (ready.size > MAX_ATTACHMENT_BYTES) throw new Error(`"${file.name}" pesa más de 10 MB.`);
                await uploadTrainingAttachment(worker.id, row.id, ready);
              } catch (err) {
                toast(`Formación guardada, pero el adjunto falló: ${friendlyError(err)}`, 'error', 6000);
              }
            }
            trainings.unshift(row);
            trainings.sort((a, b) => (a.training_date < b.training_date ? 1 : -1));
            onAdded();
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
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Certificado (opcional)'), h('div', { class: 'btn-row' }, button('Elegir archivo', { variant: 'ghost', small: true, iconName: 'camera', onClick: () => fileInput.click() }), fileLabel), fileInput),
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
            { style: 'margin-top:8px' },
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

  card.append(list, h('div', { style: 'margin-top:12px' }, button('Añadir periodo', { variant: 'ghost', block: true, iconName: 'plus', onClick: () => openAddVacationSheet(worker, vacations, render) })));
  return section('Vacaciones', card);
}

function openAddVacationSheet(worker, vacations, onAdded) {
  return openSheet('Añadir periodo de vacaciones', (close) => {
    const start = textField('Inicio', 'start_date', { type: 'date', required: true, value: todayISO() });
    const end = textField('Fin', 'end_date', { type: 'date', required: true, value: todayISO() });
    const notes = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas (opcional)'), h('textarea', { name: 'notes' }));
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
            const row = await addVacation({ worker_id: worker.id, start_date: f.start_date, end_date: f.end_date, notes: f.notes });
            vacations.unshift(row);
            vacations.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
            onAdded();
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
