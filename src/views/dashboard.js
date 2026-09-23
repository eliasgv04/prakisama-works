// Panel principal: centrado en los avisos de vencimiento (reconocimiento médico + productos
// bancarios), con semáforo, como pedía el usuario — no en contadores de "cuántas cosas activas hay".

import { listAllBankProducts, listBanks, listLatestMedicalCheckups, listPendingCertifications, listWorkers } from '../lib/api.js';
import { fmtDate, fmtMoney } from '../lib/format.js';
import { chip, empty, section } from '../ui/components.js';
import { h, clear } from '../ui/dom.js';
import { dueStatus } from '../lib/dueStatus.js';

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
    const status = dueStatus(p.end_date);
    if (status) dueItems.push({ status, date: p.end_date, title: p.name, subtitle: [bank.name, p.project?.name].filter(Boolean).join(' · '), href: `#/bancos/${bank.id}` });
  }
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
      listHost.append(empty(dueItems.length === 0 ? 'No hay reconocimientos médicos ni productos bancarios con fecha registrada todavía.' : 'No hay vencimientos con este estado.'));
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
  const summary = dueItems.length === 0 ? 'Añade un reconocimiento médico o un producto bancario con fecha para verlo aquí.' : attention === 0 ? 'Todo al día.' : `${attention === 1 ? '1 vencimiento pide' : `${attention} vencimientos piden`} atención.`;
  const hero = h(
    'div',
    { class: 'hero-band' },
    h('div', { class: 'eyebrow' }, 'Panel de control'),
    h('h1', {}, 'Prakisama Works'),
    h('p', {}, h('strong', {}, summary)),
  );

  const node = h('div', {}, hero, tileHost, section('Vencimientos', listHost));

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
              h('div', { class: 'grow' }, h('div', { class: 'what' }, c.project?.name ?? '—'), h('div', { class: 'muted small' }, `Certificada el ${fmtDate(c.cert_date)}`)),
              h('div', { class: 'strong' }, fmtMoney(c.amount)),
            ),
          ),
        ),
      ),
    );
  }

  return { title: 'Panel', node, tab: 'panel', wide: true, hideTitle: true };
}
