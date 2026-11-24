// Ficha del banco: datos de contacto y sus productos, por tipo (migración 18):
//   - Préstamos y leasing: una tarjeta cada uno con la cuota, lo pagado y lo pendiente, y una barra
//     de progreso (cálculos en src/lib/loans.js).
//   - Avales: con su semáforo (fin de la garantía) y la obra, sea de la app o escrita a mano.
//   - Otros (líneas de crédito, pólizas…): nombre, importe y fecha de vencimiento a mano.
// Al añadir un producto se elige primero el tipo con unas tarjetas grandes, y luego cada tipo pide
// solo sus datos.

import { addBankProduct, deleteBankProduct, listBankProducts, listBanks, listProjects, updateBankProduct } from '../lib/api.js';
import { addPeriod } from '../lib/dates.js';
import { friendlyError } from '../lib/errors.js';
import { fmtDate, fmtMoney, fmtMonths } from '../lib/format.js';
import { avalProjectName, frenchPayment, loanSummary, PRODUCT_KINDS, productDueStatus } from '../lib/loans.js';
import { navigate } from '../router.js';
import { avalDateFields, avalDatesText } from '../ui/avalFields.js';
import { button, chip, icon, periodField, readForm, selectField, textField, toNum } from '../ui/components.js';
import { h, openSheet, toast } from '../ui/dom.js';
import { actionButton, cardActions, deleteLink, detailHead, facts, linkButton, panel, panelText, panelValue, progressBar, record, records } from '../ui/panel.js';

const STATUS_LABEL = { ok: 'Al día', soon: 'Próximo', overdue: 'Vencido' };
const fmtRate = (r) => `${Number(r).toLocaleString('es-ES', { maximumFractionDigits: 3 })} %`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default async function bankDetail({ params }) {
  const [bank, products] = await Promise.all([listBanks().then((all) => all.find((b) => b.id === params.id)), listBankProducts(params.id)]);
  if (!bank) throw new Error('No se encuentra este banco.');

  const grid = h('div', { class: 'detail-grid' });
  const render = () => grid.replaceChildren(...productCards(bank, products, render));
  render();

  const add = button('Añadir producto', { small: true, iconName: 'plus', onClick: () => openProductSheet(bank, products, render) });
  const node = h('div', {}, heroCard(bank, add), grid);
  return { title: bank.name, hideTitle: true, wide: true, back: '/bancos', tab: 'finanzas', node };
}

function heroCard(bank, add) {
  return detailHead({
    iconName: 'euro',
    title: bank.name,
    chip: bank.active ? null : chip('De baja', 'neutral'),
    editLabel: 'Editar banco',
    onEdit: () => navigate(`/bancos/${bank.id}/editar`),
    extra: add,
    rows: [['Contacto', bank.contact_name], ['Teléfono', bank.phone], ['Email', bank.email]],
    notes: bank.notes,
  });
}

// ---------------------------------------------------------------------------
// Tarjetas de la ficha
// ---------------------------------------------------------------------------

function productCards(bank, products, render) {
  const loans = products.filter((p) => p.kind === 'prestamo' || p.kind === 'leasing');
  const avales = products.filter((p) => p.kind === 'aval');
  const others = products.filter((p) => p.kind === 'otro');
  const edit = (p) => () => openProductSheet(bank, products, render, p);
  const remove = (p, what) => deleteLink(what, () => deleteBankProduct(p.id), () => { products.splice(products.indexOf(p), 1); render(); });

  if (products.length === 0) {
    const card = panel('Productos', null, panelValue(null, 'Sin productos'), panelText('Avales, préstamos, leasing, líneas de crédito…'), cardActions(actionButton('Añadir producto', 'plus', () => openProductSheet(bank, products, render), '')));
    card.classList.add('full');
    return [card];
  }

  const cards = [];
  if (loans.length) cards.push(financingSummaryCard(loans));
  if (avales.length) cards.push(avalesCard(avales, edit, remove));
  for (const p of loans) cards.push(loanCard(p, edit(p), remove(p, `este ${PRODUCT_KINDS[p.kind].label.toLowerCase()}`)));
  if (others.length) cards.push(othersCard(others, edit, remove));
  // Si la última fila se queda con una sola tarjeta, ocupa todo el ancho (sin hueco a la derecha).
  if (cards.length % 2 === 1) cards[cards.length - 1].classList.add('full');
  return cards;
}

/** Resumen de toda la financiación del banco: lo que se paga al mes y lo que queda. */
function financingSummaryCard(loans) {
  const sums = loans.map((p) => loanSummary(p)).filter((s) => s && !s.incomplete);
  const active = sums.filter((s) => !s.finished);
  const monthly = active.reduce((acc, s) => acc + s.payment, 0);
  const total = sums.reduce((acc, s) => acc + s.totalPayments, 0);
  const paid = sums.reduce((acc, s) => acc + s.paid, 0);
  const remaining = sums.reduce((acc, s) => acc + s.remaining, 0);
  return panel(
    'Financiación',
    active.length ? chip(`${active.length} en curso`, 'ok') : chip('Todo pagado', 'neutral'),
    panelValue(fmtMoney(remaining)),
    panelText(`por pagar entre ${plural(loans.length, 'préstamo o leasing', 'préstamos y leasing')}`),
    total > 0 ? progressBar(paid / total, `Pagado ${fmtMoney(paid)}`, `${Math.round((paid / total) * 100)} %`) : null,
    facts([
      ['Cuota mensual total', active.length ? fmtMoney(monthly) : null],
      ['Total a pagar', fmtMoney(total)],
      ['Intereses', fmtMoney(sums.reduce((acc, s) => acc + s.interest, 0))],
    ]),
  );
}

/** Una tarjeta por préstamo o leasing: lo pendiente, la barra de progreso y todos los datos. */
function loanCard(p, onEdit, deleteBtn) {
  const kind = PRODUCT_KINDS[p.kind];
  const s = loanSummary(p);
  let state;
  if (!s || s.incomplete) state = chip('Faltan datos', 'neutral');
  else if (s.finished) state = chip('Pagado', 'neutral');
  else if (!s.started) state = chip('Sin empezar', 'neutral');
  else state = chip('En curso', 'ok');

  const card = panel(kind.label, state, h('div', { class: 'loan-name' }, p.name));
  if (!s || s.incomplete) {
    card.append(
      panelValue(p.amount != null ? fmtMoney(p.amount) : null, 'Sin importe'),
      panelText(!s ? 'Pon el importe financiado y el plazo para calcular las cuotas.' : 'Pon el interés o la cuota mensual para calcular lo pagado y lo pendiente.'),
    );
  } else {
    card.append(
      panelValue(fmtMoney(s.remaining)),
      panelText(s.finished ? 'Terminado de pagar.' : `por pagar de ${fmtMoney(s.totalPayments)}`),
      progressBar(s.progress, `Pagado ${fmtMoney(s.paid)} · ${Math.round(s.progress * 100)} %`, `${s.made} de ${s.months} cuotas`),
    );
  }
  const soonText = s?.daysToNext != null && s.daysToNext <= 7 ? ` (${s.daysToNext === 0 ? 'hoy' : `en ${plural(s.daysToNext, 'día', 'días')}`})` : '';
  card.append(
    facts([
      ['Cuota mensual', s?.payment != null ? fmtMoney(s.payment) : null],
      ['Próxima cuota', s?.nextPaymentDate ? `${fmtDate(s.nextPaymentDate)}${soonText}` : null],
      ['Capital pendiente', s?.capitalLeft != null && !s.finished ? fmtMoney(s.capitalLeft) : null],
      ['Importe financiado', p.amount != null ? fmtMoney(p.amount) : null],
      ['Intereses totales', s?.interest != null ? fmtMoney(s.interest) : null],
      ['Interés (TIN)', p.interest_rate != null ? fmtRate(p.interest_rate) : null],
      ['Valor residual', p.kind === 'leasing' && p.residual_value != null ? fmtMoney(p.residual_value) : null],
      ['Plazo', p.term_months ? fmtMonths(p.term_months) : null],
      ['Constitución', p.start_date ? fmtDate(p.start_date) : null],
      ['Fin', p.end_date ? fmtDate(p.end_date) : null],
    ]),
    p.notes ? panelText(p.notes) : null,
    h('div', { class: 'card-actions' }, actionButton('Editar', 'edit', onEdit), h('div', { class: 'card-actions-link' }, deleteBtn)),
  );
  return card;
}

function avalesCard(avales, edit, remove) {
  const statuses = avales.map((a) => productDueStatus(a)).filter(Boolean);
  const worst = ['overdue', 'soon'].find((st) => statuses.includes(st));
  const pending = avales.filter((a) => !a.return_requested_date);
  const total = pending.reduce((acc, a) => acc + Number(a.amount ?? 0), 0);
  return panel(
    'Avales',
    worst ? chip(worst === 'overdue' ? 'Alguno vencido' : 'Alguno vence pronto', worst) : chip('Al día', 'ok'),
    panelValue(fmtMoney(total)),
    panelText(`avalados en ${plural(pending.length, 'aval vigente', 'avales vigentes')}${avales.length > pending.length ? ` · ${avales.length - pending.length} con devolución solicitada` : ''}`),
    records(
      ...avales.map((a) => {
        const status = productDueStatus(a);
        return record({
          title: a.name,
          aside: a.return_requested_date ? chip('Devolución pedida', 'neutral') : status ? chip(STATUS_LABEL[status], status) : chip('Sin fecha', 'neutral'),
          text: a.notes,
          meta: [
            a.amount != null ? fmtMoney(a.amount) : null,
            avalProjectName(a) ? `obra: ${avalProjectName(a)}` : null,
            ...(a.end_date ? avalDatesText(a) : ['sin fecha de fin: edítalo para que avise']),
            a.return_requested_date ? `devolución solicitada el ${fmtDate(a.return_requested_date)}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          actions: [linkButton('Editar', 'edit', edit(a)), remove(a, 'este aval')],
        });
      }),
    ),
  );
}

function othersCard(others, edit, remove) {
  return panel(
    'Otros productos',
    null,
    records(
      ...others.map((p) => {
        const status = productDueStatus(p);
        return record({
          title: p.name,
          aside: status ? chip(STATUS_LABEL[status], status) : null,
          text: p.notes,
          meta: [p.amount != null ? fmtMoney(p.amount) : null, p.end_date ? `vence el ${fmtDate(p.end_date)}` : 'sin fecha de vencimiento'].filter(Boolean).join(' · '),
          actions: [linkButton('Editar', 'edit', edit(p)), remove(p, 'este producto')],
        });
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Alta y edición: primero el tipo (tarjetas), luego el formulario de ese tipo
// ---------------------------------------------------------------------------

/** Sin `existing`: elige el tipo y añade uno nuevo. Con `existing`: edita (el tipo no cambia). */
function openProductSheet(bank, products, onSaved, existing = null) {
  return openSheet(existing ? `Editar ${PRODUCT_KINDS[existing.kind].label.toLowerCase()}` : 'Añadir producto', (close) =>
    (async () => {
      const projects = await listProjects();
      const host = h('div', {});
      const setTitle = (text) => host.closest('dialog')?.querySelector('h3')?.replaceChildren(text);

      const save = async (fields) => {
        if (existing) Object.assign(existing, await updateBankProduct(existing.id, fields));
        else products.push(await addBankProduct({ ...fields, bank_id: bank.id }));
        products.sort((a, b) => ((a.end_date ?? '9999') < (b.end_date ?? '9999') ? -1 : 1));
        onSaved();
        close(true);
      };

      const showForm = (kind) => {
        setTitle(`${existing ? 'Editar' : 'Añadir'} ${PRODUCT_KINDS[kind].label.toLowerCase()}`);
        const back = existing ? null : h('button', { type: 'button', class: 'link-btn', style: 'margin:-8px 0 8px -8px', onclick: showChooser }, icon('back', 18), 'Cambiar de tipo');
        const form = kind === 'aval' ? avalForm(existing, projects, save) : kind === 'otro' ? otherForm(existing, save) : loanForm(kind, existing, save);
        host.replaceChildren(...(back ? [back] : []), form);
      };

      function showChooser() {
        setTitle('Añadir producto');
        host.replaceChildren(
          h('p', { class: 'muted', style: 'margin-bottom:14px' }, '¿Qué quieres añadir?'),
          h(
            'div',
            { class: 'kind-grid' },
            Object.entries(PRODUCT_KINDS).map(([kind, cfg]) =>
              h(
                'button',
                { type: 'button', class: 'kind-card', onclick: () => showForm(kind) },
                h('span', { class: 'kind-icon' }, icon(cfg.iconName, 26)),
                h('span', { class: 'kind-label' }, cfg.label),
                h('span', { class: 'kind-hint' }, cfg.hint),
              ),
            ),
          ),
        );
      }

      if (existing) showForm(existing.kind);
      else showChooser();
      return host;
    })(),
  );
}

/** Envía el formulario con el botón bloqueado y avisa si falla. */
function submitter(saveBtn, save) {
  return async (fields) => {
    saveBtn.disabled = true;
    try {
      await save(fields);
    } catch (err) {
      toast(friendlyError(err), 'error');
      saveBtn.disabled = false;
    }
  };
}

const notesField = (existing) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notas (opcional)'), h('textarea', { name: 'notes' }, existing?.notes ?? ''));
const moneyField = (label, name, value, extra = {}) => textField(label, name, { type: 'number', inputmode: 'decimal', min: 0, step: '0.01', value: value ?? '', ...extra });

// ---------- Aval ----------

function avalForm(existing, projects, save) {
  const name = textField('Nombre', 'name', { required: true, value: existing?.name ?? '', placeholder: 'Ej.: Aval Ayto. Torrenueva – piscina' });
  const amount = moneyField('Importe avalado (€)', 'amount', existing?.amount);

  // ¿De qué obra? De la app, una que no está en la app (p. ej. ya terminada) o ninguna.
  const initialMode = existing?.project_id ? 'app' : existing?.external_project ? 'external' : existing ? 'none' : 'app';
  const appProjects = projects.filter((p) => p.active || p.id === existing?.project_id).map((p) => [p.id, p.name]);
  const modes = [['app', 'Obra de la app'], ['external', 'Otra obra'], ['none', 'Sin obra']];
  const modeSeg = h('div', { class: 'seg', role: 'radiogroup' }, modes.map(([value, label]) => h('label', {}, h('input', { type: 'radio', name: 'obra_mode', value, checked: value === initialMode }), h('span', {}, label))));
  const projectSelect = selectField('Obra', 'project_id', [['', 'Elige la obra'], ...appProjects], { value: existing?.project_id ?? '', hint: 'Se ve también desde la ficha de la obra.' });
  const external = textField('Nombre de la obra', 'external_project', { value: existing?.external_project ?? '', placeholder: 'Ej.: Cerramiento piscina Torrenueva', hint: 'Para obras que no están en la app, por ejemplo ya terminadas con el aval aún vigente.' });
  const syncMode = () => {
    const mode = modeSeg.querySelector('input:checked')?.value;
    projectSelect.hidden = mode !== 'app';
    external.hidden = mode !== 'external';
  };
  modeSeg.addEventListener('change', syncMode);
  syncMode();

  const dates = avalDateFields(existing, {
    manualEnd: true,
    endLabel: 'Fin del aval',
    endHint: 'Cuándo termina la garantía: avisa en el panel 30 días antes. Si pones la recepción y la duración, se calcula sola.',
  });
  const returnRequested = textField('Solicitud de devolución (opcional)', 'return_requested_date', { type: 'date', value: existing?.return_requested_date ?? '', hint: 'Cuando la pidas, el aval deja de avisar.' });
  const saveBtn = button('Guardar', { type: 'submit', block: true, iconName: 'check' });
  const send = submitter(saveBtn, save);

  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: (event) => {
        event.preventDefault();
        const f = readForm(form);
        const mode = f.obra_mode;
        if (!f.name) return toast('Escribe el nombre del aval.', 'error');
        if (mode === 'app' && !f.project_id) return toast('Elige la obra, o marca "Otra obra" si no está en la app.', 'error');
        const d = dates.read();
        if (!d.end_date && !f.return_requested_date) return toast('Pon cuándo termina el aval (o la recepción y la duración) para que pueda avisar.', 'error');
        send({
          kind: 'aval',
          name: f.name,
          amount: toNum(f.amount),
          project_id: mode === 'app' ? f.project_id : null,
          external_project: mode === 'external' ? f.external_project : null,
          ...d,
          return_requested_date: f.return_requested_date,
          notes: f.notes,
        });
      },
    },
    name,
    amount,
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, '¿De qué obra es?'), modeSeg),
    projectSelect,
    external,
    ...dates.nodes,
    returnRequested,
    notesField(existing),
    saveBtn,
  );
  return form;
}

// ---------- Préstamo y leasing ----------

function loanForm(kind, existing, save) {
  const isLeasing = kind === 'leasing';
  const name = textField('Nombre', 'name', { required: true, value: existing?.name ?? '', placeholder: isLeasing ? 'Ej.: Leasing camión Volvo FM' : 'Ej.: Préstamo nave industrial' });
  const amount = moneyField(isLeasing ? 'Valor del bien financiado (€)' : 'Importe del préstamo (€)', 'amount', existing?.amount, { required: true, hint: isLeasing ? 'Sin IVA.' : undefined });
  const start = textField('Fecha de constitución', 'start_date', { type: 'date', required: true, value: existing?.start_date ?? '' });
  const months = existing?.term_months ?? null;
  const inYears = months != null && months % 12 === 0;
  const term = periodField('Plazo', { amount: months == null ? null : inYears ? months / 12 : months, unit: inYears ? 'year' : 'month', units: ['month', 'year'], hint: 'Una cuota al mes; la primera, un mes después de la constitución.' });
  const rate = textField('Interés nominal (TIN, % anual)', 'interest_rate', { type: 'number', inputmode: 'decimal', min: 0, step: '0.001', value: existing?.interest_rate ?? '', placeholder: 'Ej.: 4,5' });
  const residual = isLeasing ? moneyField('Valor residual / opción de compra (€)', 'residual_value', existing?.residual_value, { hint: 'Lo que se paga al final para quedarse el bien. Sin IVA.' }) : null;
  const payment = moneyField('Cuota mensual (€)', 'monthly_payment', existing?.monthly_payment, { hint: 'Se calcula sola con el interés. Si el banco te da otra cuota, escríbela aquí.' });
  const paymentInput = payment.querySelector('input');
  const preview = h('div', { class: 'calc-preview' });

  const termMonths = () => {
    const { amount: n, unit } = term.read();
    return n == null ? null : unit === 'year' ? n * 12 : n;
  };
  const current = (formEl) => {
    const f = readForm(formEl);
    return { kind, amount: toNum(f.amount), start_date: f.start_date, term_months: termMonths(), interest_rate: toNum(f.interest_rate), monthly_payment: toNum(f.monthly_payment), residual_value: toNum(f.residual_value) };
  };

  const saveBtn = button('Guardar', { type: 'submit', block: true, iconName: 'check' });
  const send = submitter(saveBtn, save);
  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: (event) => {
        event.preventDefault();
        const f = readForm(form);
        const v = current(form);
        if (!f.name) return toast('Escribe el nombre.', 'error');
        if (!(v.amount > 0) || !v.start_date || !(v.term_months > 0)) return toast('Rellena el importe, la fecha de constitución y el plazo.', 'error');
        if (v.interest_rate == null && v.monthly_payment == null) return toast('Pon el interés o la cuota mensual para poder calcular.', 'error');
        if (isLeasing && v.residual_value != null && v.residual_value >= v.amount) return toast('El valor residual tiene que ser menor que el valor del bien.', 'error');
        send({
          kind,
          name: f.name,
          amount: v.amount,
          start_date: v.start_date,
          term_months: v.term_months,
          interest_rate: v.interest_rate,
          monthly_payment: v.monthly_payment,
          residual_value: isLeasing ? v.residual_value : null,
          end_date: addPeriod(v.start_date, v.term_months, 'month'), // el trigger lo recalcula igual
          notes: f.notes,
        });
      },
    },
    name,
    amount,
    h('div', { class: 'row2' }, start, rate),
    term,
    residual,
    payment,
    preview,
    notesField(existing),
    saveBtn,
  );

  // Resumen al momento: cuota calculada, total, intereses, fin y lo pagado hasta hoy.
  const refresh = () => {
    const v = current(form);
    const auto = v.amount > 0 && v.term_months > 0 && v.interest_rate != null ? frenchPayment(v.amount, v.interest_rate, v.term_months, isLeasing ? v.residual_value ?? 0 : 0) : null;
    paymentInput.placeholder = auto != null ? `${fmtMoney(auto)} (calculada)` : 'Pon el interés o escribe la cuota';
    const s = loanSummary(v);
    if (!s || s.incomplete) {
      preview.replaceChildren(h('p', { class: 'panel-text' }, 'Rellena el importe, el plazo y el interés (o la cuota) y aquí verás el resumen.'));
      return;
    }
    preview.replaceChildren(
      h('div', { class: 'calc-title' }, 'Resumen'),
      facts([
        ['Cuota mensual', fmtMoney(s.payment)],
        ['Total a pagar', fmtMoney(s.totalPayments)],
        ['Intereses', fmtMoney(s.interest)],
        ['Termina', v.start_date ? fmtDate(addPeriod(v.start_date, s.months, 'month')) : '—'],
      ]),
      s.started ? progressBar(s.progress, `Pagado hasta hoy: ${fmtMoney(s.paid)}`, `${s.made} de ${s.months} cuotas`) : null,
    );
  };
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  refresh();
  return form;
}

// ---------- Otro ----------

function otherForm(existing, save) {
  const name = textField('Nombre', 'name', { required: true, value: existing?.name ?? '', placeholder: 'Ej.: Línea de crédito, póliza de confirming…' });
  const amount = moneyField('Importe o límite (€, opcional)', 'amount', existing?.amount);
  const end = textField('Fecha de vencimiento (opcional)', 'end_date', { type: 'date', value: existing?.end_date ?? '', hint: 'Si la pones, avisa en el panel 30 días antes.' });
  const saveBtn = button('Guardar', { type: 'submit', block: true, iconName: 'check' });
  const send = submitter(saveBtn, save);
  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: (event) => {
        event.preventDefault();
        const f = readForm(form);
        if (!f.name) return toast('Escribe el nombre del producto.', 'error');
        send({ kind: 'otro', name: f.name, amount: toNum(f.amount), end_date: f.end_date, notes: f.notes });
      },
    },
    name,
    amount,
    end,
    notesField(existing),
    saveBtn,
  );
  return form;
}
