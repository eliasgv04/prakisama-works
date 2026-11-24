// Panel principal: centrado en los avisos de vencimiento (reconocimiento médico + avales y otros
// productos bancarios con fecha), con semáforo, como pedía el usuario — no en contadores de
// "cuántas cosas activas hay". Debajo: avales que vencen pronto, préstamos y leasing en curso
// (cuota, lo que queda, barra de progreso) y certificaciones sin cobrar.

import { listAllBankProducts, listBanks, listLatestMedicalCheckups, listPendingCertifications, listWorkers } from '../lib/api.js';
import { certName, fmtDate, fmtMoney } from '../lib/format.js';
import { chip, empty, section } from '../ui/components.js';
import { h, clear } from '../ui/dom.js';
import { diffDays, todayISO } from '../lib/dates.js';
import { dueStatus } from '../lib/dueStatus.js';
import { avalProjectName, loanSummary, productDueStatus } from '../lib/loans.js';
import { progressBar } from '../ui/panel.js';

const STATUS_RANK = { overdue: 0, soon: 1, ok: 2 };
const STATUS_LABEL = { overdue: 'Vencido', soon: 'Próximo', ok: 'Al día' };

export default async function dashboard() {
  const [workers, latestCheckups, banks, bankProducts, pendingCerts] = await Promise.all([
    listWorkers(),
    listLatestMedicalCheckups(),
    listBanks(),
    listAllBankProducts(),
    listPendingCertifications(),
  ]);
  const banksById = new Map(banks.map((b) => [b.id, b]));
  const pendingTotal = pendingCerts.reduce((sum, c) => sum + Number(c.amount), 0);

  // --- Todos los vencimientos de la app: reconocimiento médico + productos bancarios ---
  const dueItems = [];
  for (const w of workers.filter((w) => w.active)) {
    const date = latestCheckups.get(w.id)?.valid_until ?? null;
    const status = dueStatus(date);
    if (status) dueItems.push({ status, date, title: w.full_name, subtitle: 'Reconocimiento médico', href: `#/trabajadores/${w.id}` });
  }
  for (const p of bankProducts) {
    const bank = banksById.get(p.bank_id);
    if (!bank?.active) continue;
    // Préstamos y leasing no entran: que terminen no es un aviso (tienen su propia sección abajo).
    const status = productDueStatus(p);
    if (status) dueItems.push({ status, date: p.end_date, title: p.name, subtitle: [bank.name, avalProjectName(p)].filter(Boolean).join(' · '), href: `#/bancos/${bank.id}` });
  }
  const activeProducts = bankProducts.filter((p) => banksById.get(p.bank_id)?.active);
  dueItems.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.date.localeCompare(b.date));
  const counts = { overdue: 0, soon: 0, ok: 0 };
  for (const item of dueItems) counts[item.status]++;

  let filter = null; // 'overdue' | 'soon' | 'ok' | null
  const listHost = h('div', { class: 'list-grid' });
  const tileHost = h('div', { class: 'tiles' });

  function renderTiles() {
    clear(tileHost);
    for (const key of ['overdue', 'soon', 'ok']) {
      tileHost.append(
        h(
          'button',
          {
            class: `tile ${key}`,
            type: 'button',
            'aria-pressed': String(filter === key),
            onclick: () => { filter = filter === key ? null : key; renderTiles(); renderList(); },
          },
          h('b', {}, String(counts[key])),
          h('span', {}, key === 'ok' ? 'Al día' : `${STATUS_LABEL[key]}s`),
        ),
      );
    }
  }

  function renderList() {
    clear(listHost);
    const shown = dueItems.filter((item) => !filter || item.status === filter);
    if (shown.length === 0) {
      listHost.append(empty(dueItems.length === 0 ? 'No hay reconocimientos médicos ni avales con fecha registrada todavía.' : 'No hay vencimientos con este estado.'));
      return;
    }
    for (const item of shown) {
      listHost.append(
        h(
          'a',
          { class: `item ${item.status}`, href: item.href },
          h('div', { class: 'grow' }, h('div', { class: 'line1' }, h('span', { class: 'what' }, item.title)), h('div', { class: 'muted small' }, `${item.subtitle} · ${item.status === 'overdue' ? 'venció el' : 'vence el'} ${fmtDate(item.date)}`)),
          chip(STATUS_LABEL[item.status], item.status),
        ),
      );
    }
  }
  renderTiles();
  renderList();

  const attention = counts.overdue + counts.soon;
  const summary = dueItems.length === 0 ? 'Añade un reconocimiento médico o un aval con fecha para verlo aquí.' : attention === 0 ? 'Todo al día.' : `${attention === 1 ? '1 vencimiento pide' : `${attention} vencimientos piden`} atención.`;
  const hero = h(
    'div',
    { class: 'hero-band' },
    h('div', { class: 'eyebrow' }, 'Panel de control'),
    h('h1', {}, 'Prakisama Works'),
    h('p', {}, h('strong', {}, summary)),
  );

  const node = h('div', {}, hero, tileHost, section('Vencimientos', listHost));

  // --- Avales que vencen pronto (o ya vencidos) y sin devolución pedida: es cuando hay que pedirla ---
  const avalAlerts = activeProducts
    .filter((p) => p.kind === 'aval')
    .map((p) => ({ p, status: productDueStatus(p) }))
    .filter(({ status }) => status === 'overdue' || status === 'soon')
    .sort((a, b) => a.p.end_date.localeCompare(b.p.end_date));
  if (avalAlerts.length) {
    node.append(
      section(
        `Avales que vencen pronto (${avalAlerts.length})`,
        h(
          'div',
          { class: 'list-grid' },
          avalAlerts.map(({ p, status }) => {
            const days = diffDays(todayISO(), p.end_date);
            return h(
              'a',
              { class: `item ${status}`, href: `#/bancos/${p.bank_id}` },
              h(
                'div',
                { class: 'grow' },
                h('div', { class: 'what' }, p.name),
                h('div', { class: 'muted small' }, [banksById.get(p.bank_id)?.name, avalProjectName(p), p.amount != null ? fmtMoney(p.amount) : null].filter(Boolean).join(' · ')),
                h('div', { class: 'muted small' }, days < 0 ? `Venció el ${fmtDate(p.end_date)}: pide la devolución` : `Vence el ${fmtDate(p.end_date)} (${days === 0 ? 'hoy' : `en ${days} ${days === 1 ? 'día' : 'días'}`})`),
              ),
              chip(STATUS_LABEL[status], status),
            );
          }),
        ),
      ),
    );
  }

  // --- Préstamos y leasing: lo que se paga al mes, lo que queda y cuánto lleva cada uno ---
  const loans = activeProducts
    .filter((p) => p.kind === 'prestamo' || p.kind === 'leasing')
    .map((p) => ({ p, s: loanSummary(p) }))
    .filter(({ s }) => s && !s.incomplete && !s.finished)
    .sort((a, b) => (a.s.nextPaymentDate ?? '9999').localeCompare(b.s.nextPaymentDate ?? '9999'));
  if (loans.length) {
    const monthly = loans.reduce((acc, { s }) => acc + s.payment, 0);
    const remaining = loans.reduce((acc, { s }) => acc + s.remaining, 0);
    node.append(
      section(
        'Préstamos y leasing',
        h(
          'div',
          { class: 'card finance-summary' },
          h(
            'div',
            { class: 'stats' },
            h('div', {}, h('b', {}, fmtMoney(monthly)), h('span', {}, 'Cuotas al mes')),
            h('div', {}, h('b', {}, fmtMoney(remaining)), h('span', {}, 'Queda por pagar')),
            h('div', {}, h('b', {}, String(loans.length)), h('span', {}, loans.length === 1 ? 'En curso' : 'En curso')),
          ),
          h(
            'div',
            { class: 'loan-rows' },
            loans.map(({ p, s }) =>
              h(
                'a',
                { class: 'loan-row', href: `#/bancos/${p.bank_id}` },
                h(
                  'div',
                  { class: 'loan-row-head' },
                  h('span', { class: 'strong' }, p.name),
                  h('span', { class: 'meta' }, `${fmtMoney(s.payment)}/mes${s.nextPaymentDate ? ` · próxima ${fmtDate(s.nextPaymentDate)}` : ''}`),
                ),
                progressBar(s.progress, `${banksById.get(p.bank_id)?.name ?? ''} · quedan ${fmtMoney(s.remaining)}`, `${s.made} de ${s.months} cuotas`),
              ),
            ),
          ),
        ),
      ),
    );
  }

  // --- Certificaciones sin cobrar: no es un vencimiento por fecha, pero sigue siendo un pendiente ---
  if (pendingCerts.length) {
    node.append(
      section(
        `Certificaciones sin cobrar (${fmtMoney(pendingTotal)})`,
        h(
          'div',
          { class: 'list-grid' },
          pendingCerts.slice(0, 8).map((c) =>
            h(
              'a',
              { class: 'item', href: `#/obras/${c.project_id}` },
              h('div', { class: 'grow' }, h('div', { class: 'what' }, certName(c)), h('div', { class: 'muted small' }, `${c.project?.name ?? '—'} · certificada el ${fmtDate(c.cert_date)}`)),
              h('div', { class: 'strong' }, fmtMoney(c.amount)),
            ),
          ),
        ),
      ),
    );
  }

  return { title: 'Panel', node, tab: 'panel', wide: true, hideTitle: true };
}
