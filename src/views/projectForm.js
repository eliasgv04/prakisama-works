// Alta y edición de una obra. Al crear una obra nueva, también se puede rellenar de una vez su
// checklist de hitos, su aval, sus proveedores/subcontratas y sus primeras certificaciones: como la
// obra todavía no existe, se guardan en memoria ("staged") y se mandan justo después de crearla.
// Al editar una obra ya existente, todo eso se gestiona desde su ficha.

import { MILESTONE_KINDS } from '../lib/constants.js';
import {
  addBankProduct,
  addCertification,
  addProjectProvider,
  addProjectSubcontractor,
  getProject,
  listBanks,
  listProjects,
  listProviders,
  listSubcontractors,
  saveMilestone,
  saveProject,
  setProjectActive,
  uploadMilestoneAttachment,
} from '../lib/api.js';
import { todayISO } from '../lib/dates.js';
import { friendlyError } from '../lib/errors.js';
import { fmtDate, fmtMoney } from '../lib/format.js';
import { MAX_ATTACHMENT_BYTES, prepareAttachment } from '../lib/image.js';
import { navigate } from '../router.js';
import { accordion } from '../ui/accordion.js';
import { areaField, button, chip, readForm, section, selectField, textField, toNum } from '../ui/components.js';
import { confirmDialog, h, openSheet, toast } from '../ui/dom.js';
import { removableRow, stagedSection } from '../ui/staging.js';

export default async function projectForm({ params }) {
  const editing = Boolean(params.id);
  let project = null;
  if (editing) {
    project = (await listProjects()).find((p) => p.id === params.id);
    if (!project) throw new Error('No se encuentra esta obra.');
  }
  const p = project ?? {};

  const name = textField('Nombre de la obra', 'name', { required: true, value: p.name ?? '' });
  const reference = textField('Referencia (opcional)', 'reference', { value: p.reference ?? '' });
  const startDate = textField('Inicio (opcional)', 'start_date', { type: 'date', value: p.start_date ?? '' });
  const endDate = textField('Finalización (opcional)', 'end_date', { type: 'date', value: p.end_date ?? '' });

  const taxBase = textField('Base imponible (€)', 'tax_base', { type: 'number', inputmode: 'decimal', min: 0, step: '0.01', value: p.tax_base ?? '' });
  const vatRate = textField('IVA (%)', 'vat_rate', { type: 'number', inputmode: 'decimal', min: 0, step: '0.01', value: p.vat_rate ?? '21', hint: 'El importe total se calcula solo a partir de estos dos valores.' });
  const totalPreview = h('div', { class: 'big' }, p.total_amount != null ? fmtMoney(p.total_amount) : '—');
  const updateTotal = () => {
    const base = toNum(taxBase.querySelector('input').value);
    const vat = toNum(vatRate.querySelector('input').value) ?? 0;
    totalPreview.textContent = base == null ? '—' : fmtMoney(Math.round(base * (1 + vat / 100) * 100) / 100);
  };
  taxBase.querySelector('input').addEventListener('input', updateTotal);
  vatRate.querySelector('input').addEventListener('input', updateTotal);

  const notes = areaField('Notas', 'notes', { value: p.notes ?? '' });
  const basicFields = [name, reference, h('div', { class: 'row2' }, startDate, endDate), h('div', { class: 'row2' }, taxBase, vatRate), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Importe total (calculado)'), totalPreview), notes];
  const readBasicFields = () => ({
    name: name.querySelector('input').value.trim() || null,
    reference: reference.querySelector('input').value.trim() || null,
    start_date: startDate.querySelector('input').value || null,
    end_date: endDate.querySelector('input').value || null,
    tax_base: toNum(taxBase.querySelector('input').value),
    vat_rate: toNum(vatRate.querySelector('input').value),
    notes: notes.querySelector('textarea').value.trim() || null,
  });

  if (editing) {
    // Edición: formulario simple. Hitos, aval, proveedores/subcontratas y certificaciones se
    // gestionan desde la ficha (ya tienen su propio historial con adjuntos y borrado).
    const save = button('Guardar', { type: 'submit', block: true, iconName: 'check' });
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: async (event) => {
          event.preventDefault();
          const f = readBasicFields();
          if (!f.name) return toast('Escribe el nombre de la obra.', 'error');
          save.disabled = true;
          try {
            const saved = await saveProject(params.id, f);
            toast('Obra guardada', 'success');
            navigate(`/obras/${saved.id}`);
          } catch (err) {
            toast(friendlyError(err), 'error');
            save.disabled = false;
          }
        },
      },
      ...basicFields,
      save,
    );
    const node = h('div', { class: 'stack' }, form);
    node.append(
      project.active
        ? button('Dar de baja', {
            variant: 'danger',
            block: true,
            onClick: async () => {
              const ok = await confirmDialog({ title: '¿Dar de baja esta obra?', message: 'Dejará de aparecer en las listas activas. No se borra nada: podrás reactivarla cuando quieras.', confirmText: 'Dar de baja', danger: true });
              if (!ok) return;
              try {
                await setProjectActive(project.id, false);
                toast('Obra dada de baja', 'success');
                navigate('/obras');
              } catch (err) {
                toast(friendlyError(err), 'error');
              }
            },
          })
        : button('Reactivar obra', {
            block: true,
            onClick: async () => {
              try {
                await setProjectActive(project.id, true);
                toast('Obra reactivada', 'success');
                navigate(`/obras/${project.id}`);
              } catch (err) {
                toast(friendlyError(err), 'error');
              }
            },
          }),
    );
    return { title: 'Editar obra', back: `/obras/${params.id}`, tab: 'obras', node };
  }

  // --- Alta: datos básicos + hitos / aval / proveedores / subcontratas / certificaciones "en preparación" ---
  const [banks, providers, subcontractors] = await Promise.all([listBanks(), listProviders(), listSubcontractors()]);

  const stagedMilestones = Object.fromEntries(Object.keys(MILESTONE_KINDS).map((kind) => [kind, { done_date: '', notes: '', file: null }]));
  const stagedAval = [];
  const stagedProviderIds = [];
  const stagedSubcontractorIds = [];
  const stagedCertifications = [];

  const milestonesEl = stagedMilestonesCard(stagedMilestones);

  const avalCard = stagedSection(
    'Añadir aval',
    stagedAval,
    (a, remove) => removableRow(a.name, [banks.find((b) => b.id === a.bank_id)?.name, a.amount != null ? fmtMoney(a.amount) : null, a.end_date ? `hasta ${fmtDate(a.end_date)}` : null].filter(Boolean).join(' · '), remove),
    () => openStagedAvalSheet(banks, stagedAval, avalCard.render),
  );

  const providersCardEl = stagedSection(
    'Añadir proveedor',
    stagedProviderIds,
    (id, remove) => removableRow(providers.find((x) => x.id === id)?.name ?? '(proveedor)', null, remove),
    () => openStagedPickSheet('Añadir proveedor', 'Proveedor', providers.filter((x) => x.active && !stagedProviderIds.includes(x.id)), stagedProviderIds, providersCardEl.render, 'No quedan proveedores activos por añadir.'),
  );

  const subcontractorsCardEl = stagedSection(
    'Añadir subcontrata',
    stagedSubcontractorIds,
    (id, remove) => removableRow(subcontractors.find((x) => x.id === id)?.name ?? '(subcontrata)', null, remove),
    () => openStagedPickSheet('Añadir subcontrata', 'Subcontrata', subcontractors.filter((x) => x.active && !stagedSubcontractorIds.includes(x.id)), stagedSubcontractorIds, subcontractorsCardEl.render, 'No quedan subcontratas activas por añadir.'),
  );

  const certificationsCardEl = stagedSection(
    'Añadir certificación',
    stagedCertifications,
    (c, remove) => removableRow(fmtMoney(c.amount), `${fmtDate(c.cert_date)} · ${c.payment_date ? `cobrada el ${fmtDate(c.payment_date)}` : 'pendiente de cobro'}`, remove),
    () => openStagedCertificationSheet(stagedCertifications, certificationsCardEl.render),
  );

  const save = button('Guardar obra', { block: true, iconName: 'check' });
  save.onclick = async () => {
    const fields = readBasicFields();
    if (!fields.name) return toast('Escribe el nombre de la obra.', 'error');
    save.disabled = true;
    try {
      const saved = await saveProject(null, fields);
      const failures = [];

      try {
        const { milestones } = await getProject(saved.id);
        for (const m of milestones) {
          const staged = stagedMilestones[m.kind];
          if (!staged || (!staged.done_date && !staged.notes && !staged.file)) continue;
          try {
            await saveMilestone(m.id, { done_date: staged.done_date || null, notes: staged.notes || null });
            if (staged.file) {
              const ready = await prepareAttachment(staged.file);
              if (ready.size > MAX_ATTACHMENT_BYTES) throw new Error('adjunto demasiado grande');
              await uploadMilestoneAttachment(saved.id, m.id, ready);
            }
          } catch {
            failures.push(`el hito "${MILESTONE_KINDS[m.kind]}"`);
          }
        }
      } catch {
        failures.push('los hitos');
      }

      for (const a of stagedAval) {
        try {
          await addBankProduct({ ...a, project_id: saved.id });
        } catch {
          failures.push('un aval');
        }
      }
      for (const providerId of stagedProviderIds) {
        try {
          await addProjectProvider(saved.id, providerId);
        } catch {
          failures.push('un proveedor');
        }
      }
      for (const subcontractorId of stagedSubcontractorIds) {
        try {
          await addProjectSubcontractor(saved.id, subcontractorId);
        } catch {
          failures.push('una subcontrata');
        }
      }
      for (const c of stagedCertifications) {
        try {
          await addCertification(saved.id, c);
        } catch {
          failures.push('una certificación');
        }
      }

      toast(failures.length ? `Obra guardada, pero falló: ${failures.join(', ')}. Añádelo desde su ficha.` : 'Obra guardada', failures.length ? 'error' : 'success', failures.length ? 6000 : 3800);
      navigate(`/obras/${saved.id}`);
    } catch (err) {
      toast(friendlyError(err), 'error');
      save.disabled = false;
    }
  };

  const node = h(
    'div',
    { class: 'stack' },
    ...basicFields,
    section('Hitos y documentación (opcional)', milestonesEl),
    section('Aval (opcional)', avalCard.el),
    section('Proveedores (opcional)', providersCardEl.el),
    section('Subcontratas (opcional)', subcontractorsCardEl.el),
    section('Certificaciones (opcional)', certificationsCardEl.el),
    h('div', { class: 'spacer' }),
    save,
  );

  return { title: 'Nueva obra', back: '/obras', tab: 'obras', node };
}

// ---------------------------------------------------------------------------
// Hitos: 7 tipos fijos (no se añaden ni se quitan), cada uno con fecha/notas/adjunto opcionales.
// ---------------------------------------------------------------------------

function stagedMilestonesCard(stagedMilestones) {
  const rows = Object.keys(MILESTONE_KINDS).map((kind) => stagedMilestoneRow(kind, stagedMilestones[kind]));
  const card = accordion({ group: 'top-obra-nueva', iconName: 'file', title: 'Hitos y documentación', summary: 'Se pueden rellenar ahora o luego desde la ficha', content: rows.map((r) => r.el) });
  return card.el;
}

function stagedMilestoneRow(kind, state) {
  const describe = () => ({ summary: state.done_date ? `Hecho el ${fmtDate(state.done_date)}` : 'Pendiente', warn: !state.done_date, badge: chip(state.done_date ? 'Hecho' : 'Pendiente', state.done_date ? 'ok' : 'neutral') });

  const dateInput = h('input', { type: 'date', value: state.done_date });
  const notesInput = h('textarea', {}, state.notes);
  const fileLabel = h('span', { class: 'muted small' }, state.file ? state.file.name : 'Sin archivo');
  const fileInput = h('input', {
    type: 'file',
    accept: 'image/*,application/pdf',
    hidden: true,
    onchange: (event) => { state.file = event.target.files?.[0] ?? null; fileLabel.textContent = state.file ? state.file.name : 'Sin archivo'; },
  });
  const save = button('Guardar', { block: true, iconName: 'check' });
  save.onclick = () => {
    state.done_date = dateInput.value || '';
    state.notes = notesInput.value.trim();
    card.set(describe());
    toast('Guardado', 'success');
  };

  const content = h(
    'div',
    { class: 'stack' },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Fecha'), dateInput),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas'), notesInput),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Adjunto'), h('div', { class: 'btn-row' }, button('Elegir archivo', { variant: 'ghost', small: true, iconName: 'camera', onClick: () => fileInput.click() }), fileLabel), fileInput),
    save,
  );

  const card = accordion({ group: 'hitos-obra-nueva', sub: true, title: MILESTONE_KINDS[kind], ...describe(), content });
  return card;
}

// ---------------------------------------------------------------------------
// Aval, proveedores/subcontratas y certificaciones "en preparación"
// ---------------------------------------------------------------------------

function openStagedAvalSheet(banks, list, onAdded) {
  return openSheet('Añadir aval', (close) => {
    const activeBanks = banks.filter((b) => b.active);
    if (activeBanks.length === 0) return h('p', { class: 'muted' }, 'Primero da de alta un banco en Finanzas.');
    const bank = selectField('Banco', 'bank_id', activeBanks.map((b) => [b.id, b.name]));
    const name = textField('Nombre', 'name', { required: true, value: 'Aval' });
    const amount = textField('Importe (€, opcional)', 'amount', { type: 'number', inputmode: 'decimal', min: 0, step: '0.01' });
    const endDate = textField('Fin del periodo de garantía (opcional)', 'end_date', { type: 'date' });
    const returnRequested = textField('Solicitud de devolución (opcional)', 'return_requested_date', { type: 'date' });
    const notes = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas (opcional)'), h('textarea', { name: 'notes' }));
    const add = button('Añadir', { type: 'submit', block: true, iconName: 'check' });
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: (event) => {
          event.preventDefault();
          const f = readForm(form);
          if (!f.bank_id || !f.name) return toast('Elige el banco y escribe el nombre.', 'error');
          list.push({ bank_id: f.bank_id, name: f.name, amount: toNum(f.amount), end_date: f.end_date, return_requested_date: f.return_requested_date, notes: f.notes });
          onAdded();
          close(true);
        },
      },
      bank,
      name,
      amount,
      endDate,
      returnRequested,
      notes,
      add,
    );
    return form;
  });
}

/** Sheet genérica para elegir un proveedor o una subcontrata de una lista y añadir su id a `staged`. */
function openStagedPickSheet(title, fieldLabel, options, staged, onAdded, emptyMessage) {
  return openSheet(title, (close) => {
    if (options.length === 0) return h('p', { class: 'muted' }, emptyMessage);
    const select = selectField(fieldLabel, 'picked_id', options.map((o) => [o.id, o.name]));
    const add = button('Añadir', { type: 'submit', block: true, iconName: 'check' });
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: (event) => {
          event.preventDefault();
          staged.push(readForm(form).picked_id);
          onAdded();
          close(true);
        },
      },
      select,
      add,
    );
    return form;
  });
}

function openStagedCertificationSheet(list, onAdded) {
  return openSheet('Añadir certificación', (close) => {
    const date = textField('Fecha', 'cert_date', { type: 'date', required: true, value: todayISO() });
    const amount = textField('Importe (€)', 'amount', { type: 'number', inputmode: 'decimal', min: 0, step: '0.01', required: true });
    const paid = h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'paid' }), 'Ya está cobrada');
    const paymentDate = textField('Fecha de cobro', 'payment_date', { type: 'date', value: todayISO() });
    paymentDate.hidden = true;
    paid.querySelector('input').addEventListener('change', (event) => { paymentDate.hidden = !event.target.checked; });
    const notes = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas (opcional)'), h('textarea', { name: 'notes' }));
    const add = button('Añadir', { type: 'submit', block: true, iconName: 'check' });
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: (event) => {
          event.preventDefault();
          const f = readForm(form);
          if (!f.cert_date || toNum(f.amount) == null) return toast('Rellena la fecha y el importe.', 'error');
          list.push({ cert_date: f.cert_date, amount: toNum(f.amount), payment_date: f.paid ? f.payment_date : null, notes: f.notes });
          onAdded();
          close(true);
        },
      },
      date,
      amount,
      paid,
      paymentDate,
      notes,
      add,
    );
    return form;
  });
}
