// Alta y edición de un trabajador. Al crear uno nuevo, también se puede añadir de una vez su
// primer reconocimiento médico, formación y periodos de vacaciones: como el trabajador todavía no
// existe en la base de datos, se guardan en memoria ("staged") y se mandan justo después de crear
// el trabajador. Al editar uno ya existente, esas tres cosas se gestionan desde su ficha.

import { addMedicalCheckup, addTraining, addVacation, listWorkers, saveWorker, setWorkerActive, uploadTrainingAttachment } from '../lib/api.js';
import { todayISO } from '../lib/dates.js';
import { friendlyError } from '../lib/errors.js';
import { fmtDate } from '../lib/format.js';
import { MAX_ATTACHMENT_BYTES, prepareAttachment } from '../lib/image.js';
import { navigate } from '../router.js';
import { areaField, button, readForm, section, textField } from '../ui/components.js';
import { confirmDialog, h, openSheet, toast } from '../ui/dom.js';
import { removableRow, stagedSection } from '../ui/staging.js';

export default async function workerForm({ params }) {
  const editing = Boolean(params.id);
  let worker = null;
  if (editing) {
    worker = (await listWorkers()).find((w) => w.id === params.id);
    if (!worker) throw new Error('No se encuentra este trabajador.');
  }
  const w = worker ?? {};

  const name = textField('Nombre', 'full_name', { required: true, value: w.full_name ?? '' });
  const nif = textField('DNI/NIF (opcional)', 'nif', { value: w.nif ?? '' });
  const phone = textField('Teléfono (opcional)', 'phone', { type: 'tel', value: w.phone ?? '' });
  const role = textField('Categoría u oficio (opcional)', 'role', { value: w.role ?? '', placeholder: 'Ej.: oficial, peón, encargado' });
  const notes = areaField('Notas', 'notes', { value: w.notes ?? '' });
  const basicFields = [name, nif, phone, role, notes];
  const readBasicFields = () => ({
    full_name: name.querySelector('input').value.trim() || null,
    nif: nif.querySelector('input').value.trim() || null,
    phone: phone.querySelector('input').value.trim() || null,
    role: role.querySelector('input').value.trim() || null,
    notes: notes.querySelector('textarea').value.trim() || null,
  });

  const node = h('div', { class: 'stack' });

  if (editing) {
    // Edición: formulario simple. El reconocimiento médico, la formación y las vacaciones se
    // gestionan desde la ficha (ya tienen su propio historial con adjuntos y borrado).
    const save = button('Guardar', { type: 'submit', block: true, iconName: 'check' });
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: async (event) => {
          event.preventDefault();
          const f = readForm(form);
          if (!f.full_name) return toast('Escribe el nombre.', 'error');
          save.disabled = true;
          try {
            const saved = await saveWorker(params.id, { full_name: f.full_name, nif: f.nif, phone: f.phone, role: f.role, notes: f.notes });
            toast('Trabajador guardado', 'success');
            navigate(`/trabajadores/${saved.id}`);
          } catch (err) {
            toast(friendlyError(err), 'error');
            save.disabled = false;
          }
        },
      },
      ...basicFields,
      save,
    );
    node.append(
      form,
      worker.active
        ? button('Dar de baja', {
            variant: 'danger',
            block: true,
            onClick: async () => {
              const ok = await confirmDialog({ title: '¿Dar de baja a este trabajador?', message: 'Dejará de aparecer en las listas activas. No se borra nada: podrás reactivarlo cuando quieras.', confirmText: 'Dar de baja', danger: true });
              if (!ok) return;
              try {
                await setWorkerActive(worker.id, false);
                toast('Trabajador dado de baja', 'success');
                navigate('/trabajadores');
              } catch (err) {
                toast(friendlyError(err), 'error');
              }
            },
          })
        : button('Reactivar', {
            block: true,
            onClick: async () => {
              try {
                await setWorkerActive(worker.id, true);
                toast('Reactivado', 'success');
                navigate(`/trabajadores/${worker.id}`);
              } catch (err) {
                toast(friendlyError(err), 'error');
              }
            },
          }),
    );
    return { title: 'Editar trabajador', back: `/trabajadores/${params.id}`, tab: 'listas', node };
  }

  // --- Alta: datos básicos + reconocimiento médico / formación / vacaciones "en preparación" ---
  const stagedCheckups = [];
  const stagedTrainings = [];
  const stagedVacations = [];

  const checkupsCard = stagedSection('Añadir reconocimiento', stagedCheckups, (c, remove) =>
    removableRow(fmtDate(c.checkup_date), c.valid_until ? `Vence el ${fmtDate(c.valid_until)}` : 'Sin vencimiento', remove),
  () => openStagedCheckupSheet(stagedCheckups, checkupsCard.render));

  const trainingsCard = stagedSection('Añadir formación', stagedTrainings, (t, remove) =>
    removableRow(t.name, `${fmtDate(t.training_date)}${t.file ? ` · ${t.file.name}` : ''}`, remove),
  () => openStagedTrainingSheet(stagedTrainings, trainingsCard.render));

  const vacationsCard = stagedSection('Añadir periodo', stagedVacations, (v, remove) =>
    removableRow(`${fmtDate(v.start_date)} – ${fmtDate(v.end_date)}`, v.notes, remove),
  () => openStagedVacationSheet(stagedVacations, vacationsCard.render));

  const save = button('Guardar trabajador', { block: true, iconName: 'check' });
  save.onclick = async () => {
    const fields = readBasicFields();
    if (!fields.full_name) return toast('Escribe el nombre.', 'error');
    save.disabled = true;
    try {
      const saved = await saveWorker(null, fields);
      const failures = [];
      for (const c of stagedCheckups) {
        try {
          await addMedicalCheckup({ worker_id: saved.id, checkup_date: c.checkup_date, valid_until: c.valid_until, notes: c.notes });
        } catch {
          failures.push('un reconocimiento médico');
        }
      }
      for (const t of stagedTrainings) {
        try {
          const row = await addTraining({ worker_id: saved.id, training_date: t.training_date, name: t.name, notes: t.notes });
          if (t.file) {
            const ready = await prepareAttachment(t.file);
            if (ready.size > MAX_ATTACHMENT_BYTES) throw new Error('adjunto demasiado grande');
            await uploadTrainingAttachment(saved.id, row.id, ready);
          }
        } catch {
          failures.push('una formación');
        }
      }
      for (const v of stagedVacations) {
        try {
          await addVacation({ worker_id: saved.id, start_date: v.start_date, end_date: v.end_date, notes: v.notes });
        } catch {
          failures.push('un periodo de vacaciones');
        }
      }
      toast(failures.length ? `Trabajador guardado, pero falló: ${failures.join(', ')}. Añádelo desde su ficha.` : 'Trabajador guardado', failures.length ? 'error' : 'success', failures.length ? 6000 : 3800);
      navigate(`/trabajadores/${saved.id}`);
    } catch (err) {
      toast(friendlyError(err), 'error');
      save.disabled = false;
    }
  };

  node.append(...basicFields, section('Reconocimiento médico (opcional)', checkupsCard.el), section('Formación (opcional)', trainingsCard.el), section('Vacaciones (opcional)', vacationsCard.el), h('div', { class: 'spacer' }), save);

  return { title: 'Nuevo trabajador', back: '/trabajadores', tab: 'listas', node };
}

// ---------------------------------------------------------------------------
// Hojas de "añadir" en memoria (nada se guarda hasta que se crea el trabajador)
// ---------------------------------------------------------------------------

function openStagedCheckupSheet(list, onAdded) {
  return openSheet('Reconocimiento médico', (close) => {
    const date = textField('Fecha', 'checkup_date', { type: 'date', required: true, value: todayISO() });
    const validUntil = textField('Vencimiento (opcional)', 'valid_until', { type: 'date', hint: 'Si se sabe cuándo caduca, entra en el semáforo.' });
    const notes = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas (opcional)'), h('textarea', { name: 'notes' }));
    const add = button('Añadir', { type: 'submit', block: true, iconName: 'check' });
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: (event) => {
          event.preventDefault();
          const f = readForm(form);
          if (!f.checkup_date) return toast('Indica la fecha.', 'error');
          list.push({ checkup_date: f.checkup_date, valid_until: f.valid_until, notes: f.notes });
          onAdded();
          close(true);
        },
      },
      date,
      validUntil,
      notes,
      add,
    );
    return form;
  });
}

function openStagedTrainingSheet(list, onAdded) {
  return openSheet('Formación', (close) => {
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
    const add = button('Añadir', { type: 'submit', block: true, iconName: 'check' });
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: (event) => {
          event.preventDefault();
          const f = readForm(form);
          if (!f.training_date || !f.name) return toast('Indica la fecha y el nombre del curso.', 'error');
          list.push({ training_date: f.training_date, name: f.name, notes: f.notes, file });
          onAdded();
          close(true);
        },
      },
      date,
      name,
      notes,
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Certificado (opcional)'), h('div', { class: 'btn-row' }, button('Elegir archivo', { variant: 'ghost', small: true, iconName: 'camera', onClick: () => fileInput.click() }), fileLabel), fileInput),
      add,
    );
    return form;
  });
}

function openStagedVacationSheet(list, onAdded) {
  return openSheet('Periodo de vacaciones', (close) => {
    const start = textField('Inicio', 'start_date', { type: 'date', required: true, value: todayISO() });
    const end = textField('Fin', 'end_date', { type: 'date', required: true, value: todayISO() });
    const notes = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas (opcional)'), h('textarea', { name: 'notes' }));
    const add = button('Añadir', { type: 'submit', block: true, iconName: 'check' });
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: (event) => {
          event.preventDefault();
          const f = readForm(form);
          if (!f.start_date || !f.end_date) return toast('Indica el inicio y el fin.', 'error');
          if (f.end_date < f.start_date) return toast('El fin no puede ser antes que el inicio.', 'error');
          list.push({ start_date: f.start_date, end_date: f.end_date, notes: f.notes });
          onAdded();
          close(true);
        },
      },
      start,
      end,
      notes,
      add,
    );
    return form;
  });
}
