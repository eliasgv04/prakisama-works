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
import { button, chip, icon, readForm, textField } from '../ui/components.js';
import { h, openSheet, toast } from '../ui/dom.js';
import { actionButton, cardActions, deleteLink, detailHead, linkButton, panel, panelText, panelValue, record, records } from '../ui/panel.js';

const STATUS_LABEL = { ok: 'Al día', soon: 'Próximo', overdue: 'Vencido' };

export default async function workerDetail({ params }) {
  const [worker, checkups, trainings, vacations] = await Promise.all([
    listWorkers().then((all) => all.find((w) => w.id === params.id)),
    listMedicalCheckups(params.id),
    listTrainings(params.id),
    listVacations(params.id),
  ]);
  if (!worker) throw new Error('No se encuentra este trabajador.');

  // Por filas: reconocimiento médico | vacaciones, y la formación (que puede ser larga) a todo el ancho.
  const grid = h(
    'div',
    { class: 'detail-grid' },
    medicalCard(worker, checkups),
    vacationsCard(worker, vacations),
    trainingsCard(worker, trainings),
  );
  const node = h('div', {}, heroCard(worker), grid);

  return { title: worker.full_name, hideTitle: true, wide: true, back: '/trabajadores', tab: 'listas', node };
}

// ---------------------------------------------------------------------------

function heroCard(worker) {
  return detailHead({
    iconName: 'users',
    title: worker.full_name,
    chip: worker.active ? null : chip('De baja', 'neutral'),
    editLabel: 'Editar trabajador',
    onEdit: () => navigate(`/trabajadores/${worker.id}/editar`),
    rows: [
      ['DNI/NIF', worker.nif],
      ['Teléfono', worker.phone],
      ['Categoría', worker.role],
      ['Nº afiliación S.S.', worker.social_security_number],
      ['Número de cuenta', worker.account_number],
      ['Precio por hora', worker.hourly_rate != null ? `${fmtMoney(worker.hourly_rate)}/h` : null],
    ],
    notes: worker.notes,
  });
}

// ---------------------------------------------------------------------------
// Reconocimiento médico: única fecha con semáforo del personal
// ---------------------------------------------------------------------------

function medicalCard(worker, checkups) {
  const chipHost = h('span', {});
  const summary = h('div', {});
  const list = records();
  const historyTitle = h('div', { class: 'sub-title' }, 'Historial');
  const card = panel(
    'Reconocimiento médico',
    chipHost,
    summary,
    historyTitle,
    list,
    cardActions(actionButton('Registrar reconocimiento', 'plus', () => openCheckupSheet(worker, checkups, render), '')),
  );

  function render() {
    const latest = checkups[0] ?? null;
    const status = latest ? dueStatus(latest.valid_until) : null;
    chipHost.replaceChildren(status ? chip(STATUS_LABEL[status], status) : '');
    summary.replaceChildren(
      panelValue(latest ? fmtDate(latest.checkup_date) : null, 'Sin datos'),
      panelText(latest ? (latest.valid_until ? `Último reconocimiento · vence el ${fmtDate(latest.valid_until)}` : 'Último reconocimiento · sin vencimiento') : 'Todavía no se ha registrado ninguno.'),
    );
    const previous = checkups;
    historyTitle.hidden = previous.length === 0;
    list.replaceChildren(
      ...previous.map((c) =>
        record({
          title: fmtDate(c.checkup_date),
          aside: c.valid_until ? `hasta ${fmtDate(c.valid_until)}` : 'sin vencimiento',
          text: c.notes,
          actions: [
            linkButton('Editar', 'edit', () => openCheckupSheet(worker, checkups, render, c)),
            deleteLink('este reconocimiento', () => deleteMedicalCheckup(c.id), () => { checkups.splice(checkups.indexOf(c), 1); render(); }),
          ],
        }),
      ),
    );
  }
  render();
  return card;
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
  const list = records();
  const fold = accordion({ group: 'formacion', iconName: 'file', title: 'Ver formaciones', content: list });
  const summary = h('div', {});
  const folds = h('div', { class: 'folds' }, fold.el);
  const card = panel('Formación', null, summary, folds, cardActions(actionButton('Añadir formación', 'plus', () => openTrainingSheet(worker, trainings, render), '')));
  card.classList.add('full');

  function render() {
    folds.hidden = trainings.length === 0;
    const latest = trainings[0];
    summary.replaceChildren(
      panelValue(trainings.length ? `${trainings.length} ${trainings.length === 1 ? 'curso' : 'cursos'}` : null, 'Sin formación'),
      panelText(latest ? `Última: ${latest.name} (${fmtDate(latest.training_date)})` : 'Todavía no se ha registrado ninguna.'),
    );
    fold.set({ summary: latest ? `${trainings.length} en total` : '' });
    list.replaceChildren();
    for (const t of trainings) {
      const files = h('div', { class: 'attachments' });
      list.append(
        record({
          title: t.name,
          aside: fmtDate(t.training_date),
          text: t.notes,
          extra: files,
          actions: [
            linkButton('Editar', 'edit', () => openTrainingSheet(worker, trainings, render, t)),
            deleteLink('esta formación', () => deleteTraining(t.id), () => { trainings.splice(trainings.indexOf(t), 1); render(); }, { message: 'También se borrará su certificado adjunto.' }),
          ],
        }),
      );
      listTrainingAttachments(t.id).then((rows) => {
        for (const f of rows) {
          files.append(
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
  return card;
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
  const today = todayISO();
  const chipHost = h('span', {});
  const summary = h('div', {});
  const list = records();
  const card = panel('Vacaciones', chipHost, summary, list, cardActions(actionButton('Añadir periodo', 'plus', () => openVacationSheet(worker, vacations, render), '')));

  function render() {
    const current = vacations.find((v) => v.start_date <= today && today <= v.end_date);
    const next = [...vacations].filter((v) => v.start_date > today).sort((a, b) => (a.start_date < b.start_date ? -1 : 1))[0];
    chipHost.replaceChildren(current ? chip('De vacaciones', 'soon') : '');
    summary.replaceChildren(
      panelValue(vacations.length ? `${vacations.length} ${vacations.length === 1 ? 'periodo' : 'periodos'}` : null, 'Sin periodos'),
      panelText(
        current
          ? `De vacaciones hasta el ${fmtDate(current.end_date)}.`
          : next
            ? `Próximas: del ${fmtDate(next.start_date)} al ${fmtDate(next.end_date)}.`
            : vacations.length
              ? 'Sin vacaciones próximas.'
              : 'Todavía no se ha registrado ninguno.',
      ),
    );
    list.replaceChildren(
      ...vacations.map((v) =>
        record({
          title: `${fmtDate(v.start_date)} – ${fmtDate(v.end_date)}`,
          aside: v.start_date <= today && today <= v.end_date ? chip('En curso', 'soon') : null,
          text: v.notes,
          actions: [
            linkButton('Editar', 'edit', () => openVacationSheet(worker, vacations, render, v)),
            deleteLink('este periodo', () => deleteVacation(v.id), () => { vacations.splice(vacations.indexOf(v), 1); render(); }),
          ],
        }),
      ),
    );
  }
  render();
  return card;
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
