// Parte de horas: qué trabajador hizo cuántas horas en qué obra, día a día. Se navega día a día
// como un calendario; para dar de alta trabajadores y obras se usan sus listas, aquí solo se eligen.
// Cada registro lleva su precio por hora (propuesto desde el del trabajador) y su coste
// (horas × precio, columna generada), que sale en los gastos de la obra como "Trabajadores".

import { addWorkHours, deleteWorkHours, listProjects, listWorkHours, listWorkers, saveWorker, updateWorkHours } from '../lib/api.js';
import { todayISO } from '../lib/dates.js';
import { friendlyError } from '../lib/errors.js';
import { fmtDate, fmtHours, fmtMoney } from '../lib/format.js';
import { refresh } from '../router.js';
import { button, empty, icon, readForm, selectField, textField, toNum } from '../ui/components.js';
import { confirmDialog, h, openSheet, toast } from '../ui/dom.js';

const addDay = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default async function workHours({ query }) {
  const date = query.fecha && /^\d{4}-\d{2}-\d{2}$/.test(query.fecha) ? query.fecha : todayISO();
  const [entries, workers, projects] = await Promise.all([listWorkHours({ from: date, to: date }), listWorkers(), listProjects()]);

  const total = entries.reduce((sum, e) => sum + Number(e.hours), 0);
  const totalCost = entries.reduce((sum, e) => sum + Number(e.total_cost ?? 0), 0);
  const listHost = h('div', { class: 'stack tight' });

  function renderList() {
    listHost.replaceChildren();
    if (entries.length === 0) {
      listHost.append(empty('Sin horas registradas este día.'));
      return;
    }
    for (const e of entries) {
      listHost.append(
        h(
          'div',
          { class: 'record' },
          h('div', { class: 'head' }, h('span', { class: 'strong' }, e.worker?.full_name ?? '(trabajador eliminado)'), h('span', { class: 'muted small' }, fmtHours(e.hours))),
          h('div', { class: 'muted small' }, e.project?.name ?? '(obra eliminada)'),
          h('div', { class: 'muted small' }, e.hourly_rate != null ? `${fmtHours(e.hours)} × ${fmtMoney(e.hourly_rate)}/h = ${fmtMoney(e.total_cost)}` : 'Sin precio por hora'),
          e.notes ? h('p', { class: 'muted small', style: 'margin-top:4px' }, e.notes) : null,
          h(
            'div',
            { class: 'btn-row', style: 'margin-top:8px' },
            button('Editar', { small: true, variant: 'ghost', onClick: () => openHoursSheet(date, workers, projects, e) }),
            button('Borrar', {
              small: true,
              variant: 'danger',
              onClick: async () => {
                if (!(await confirmDialog({ title: '¿Borrar este registro de horas?', confirmText: 'Borrar', danger: true }))) return;
                try {
                  await deleteWorkHours(e.id);
                  toast('Borrado', 'success');
                  refresh();
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
  renderList();

  const dateInput = h('input', { type: 'date', value: date, 'aria-label': 'Día', onchange: (event) => { location.hash = `#/horas?fecha=${event.target.value}`; } });
  const nav = h(
    'div',
    { class: 'btn-row' },
    button('◂', { variant: 'ghost', small: true, onClick: () => { location.hash = `#/horas?fecha=${addDay(date, -1)}`; } }),
    h('div', { class: 'field', style: 'flex:2' }, dateInput),
    button('▸', { variant: 'ghost', small: true, onClick: () => { location.hash = `#/horas?fecha=${addDay(date, 1)}`; } }),
  );

  const node = h(
    'div',
    { class: 'stack has-fab' },
    nav,
    h('p', { class: 'muted' }, [fmtDate(date), `${fmtHours(total)} en total`, totalCost ? fmtMoney(totalCost) : null].filter(Boolean).join(' · ')),
    listHost,
    h('a', { class: 'fab', href: '#', 'aria-label': 'Añadir horas', onclick: (event) => { event.preventDefault(); openHoursSheet(date, workers, projects); } }, icon('plus')),
  );

  return { title: 'Horas', node, tab: 'horas', wide: true };
}

/** Sin `existing`: añade un registro. Con `existing`: lo edita (también se puede cambiar de día, trabajador u obra). */
function openHoursSheet(date, workers, projects, existing = null) {
  return openSheet(existing ? 'Editar horas' : 'Añadir horas', (close) => {
    // Al editar, el trabajador/obra del registro sale aunque esté de baja.
    const activeWorkers = workers.filter((w) => w.active || w.id === existing?.worker_id).map((w) => [w.id, w.full_name]);
    const activeProjects = projects.filter((p) => p.active || p.id === existing?.project_id).map((p) => [p.id, p.name]);
    if (activeWorkers.length === 0 || activeProjects.length === 0) {
      return h('p', { class: 'muted' }, 'Hace falta al menos un trabajador y una obra activos. Créalos primero desde Listas y Obras.');
    }
    const worker = selectField('Trabajador', 'worker_id', activeWorkers, { value: existing?.worker_id ?? activeWorkers[0][0] });
    const project = selectField('Obra', 'project_id', activeProjects, { value: existing?.project_id ?? activeProjects[0][0] });
    const dateField = textField('Fecha', 'work_date', { type: 'date', required: true, value: existing?.work_date ?? date });
    const hours = textField('Horas', 'hours', { type: 'number', inputmode: 'decimal', min: 0.25, max: 24, step: '0.25', required: true, value: existing?.hours ?? '8' });
    // Precio: el del registro al editar; si no, el habitual del trabajador (cambia al cambiar de trabajador).
    const workerById = (id) => workers.find((w) => w.id === id);
    const workerSelect = worker.querySelector('select');
    const rate = textField('Precio por hora (€, opcional)', 'hourly_rate', { type: 'number', inputmode: 'decimal', min: 0, step: '0.01', value: existing ? existing.hourly_rate ?? '' : workerById(workerSelect.value)?.hourly_rate ?? '' });
    const rateInput = rate.querySelector('input');
    const preview = h('div', {});
    const updatePreview = () => {
      const hh = toNum(hours.querySelector('input').value);
      const r = toNum(rateInput.value);
      preview.replaceChildren(h('div', { class: 'muted small' }, 'Total'), h('div', { class: 'big' }, hh != null && r != null ? fmtMoney(Math.round(hh * r * 100) / 100) : '—'));
    };
    workerSelect.addEventListener('change', () => {
      rateInput.value = workerById(workerSelect.value)?.hourly_rate ?? '';
      updatePreview();
    });
    hours.addEventListener('input', updatePreview);
    rate.addEventListener('input', updatePreview);
    updatePreview();
    const notes = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas (opcional)'), h('textarea', { name: 'notes' }, existing?.notes ?? ''));
    const save = button('Guardar', { type: 'submit', block: true, iconName: 'check' });
    const form = h(
      'form',
      {
        class: 'stack',
        onsubmit: async (event) => {
          event.preventDefault();
          const f = readForm(form);
          if (!f.work_date || toNum(f.hours) == null) return toast('Rellena la fecha y las horas.', 'error');
          save.disabled = true;
          try {
            const fields = { worker_id: f.worker_id, project_id: f.project_id, work_date: f.work_date, hours: toNum(f.hours), hourly_rate: toNum(f.hourly_rate), notes: f.notes };
            if (existing) await updateWorkHours(existing.id, fields);
            else await addWorkHours(fields);
            // Si el trabajador aún no tenía precio habitual, este se queda como el suyo para la próxima vez.
            const w = workerById(f.worker_id);
            if (w && w.hourly_rate == null && fields.hourly_rate != null) await saveWorker(w.id, { hourly_rate: fields.hourly_rate }).catch(() => {});
            toast('Horas guardadas', 'success');
            close(true);
            location.hash = `#/horas?fecha=${f.work_date}`;
            refresh();
          } catch (err) {
            toast(friendlyError(err), 'error');
            save.disabled = false;
          }
        },
      },
      worker,
      project,
      dateField,
      h('div', { class: 'row2' }, hours, rate),
      preview,
      notes,
      save,
    );
    return form;
  });
}
