// The CapitalCraft Books card: a statement whose figures open to the entries
// behind them, and whose entries open to their double-entry lines. The books
// themselves are in js/books.js; this file only puts them on the page.

import { ENTRIES, behind, pounds, statement } from './books.js';
import { reduceMotion } from './motion.js';

const MONTH = 'Nov';

const make = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

/** A row that can be pressed: what it is on the left, a figure on the right. */
function row(parts, figure, onPress) {
  const el = make(onPress ? 'button' : 'div', 'bk__row');
  if (onPress) {
    el.type = 'button';
    el.addEventListener('click', onPress);
  }
  for (const part of parts) el.append(part);
  el.append(make('span', 'bk__figure', figure));
  return el;
}

/**
 * @param {{ stage: HTMLElement, status: HTMLElement }} parts
 *   `stage` is emptied and drawn into; `status` is told, for screen readers,
 *   what has just been opened.
 */
export function startBooks({ stage, status }) {
  const lines = statement();
  let path = []; // nothing: the statement; [figure]: the entries behind it; [figure, entry id]: one entry

  const card = make('div', 'bk__card');
  const crumbs = make('nav', 'bk__crumbs');
  crumbs.setAttribute('aria-label', 'Where you are in the books');
  const bar = make('div', 'bk__bar');
  bar.append(crumbs, make('p', 'bk__sample', 'Sample books'));
  const body = make('div', 'bk__level');
  card.append(bar, body);
  stage.replaceChildren(card);
  stage.classList.add('is-live');

  function go(next, { focus = true } = {}) {
    const deeper = next.length > path.length;
    path = next;
    draw();
    if (!reduceMotion.matches) {
      body.animate(
        [{ opacity: 0, transform: `translateX(${deeper ? 18 : -18}px)` }, { opacity: 1, transform: 'none' }],
        { duration: 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
      );
    }
    if (focus) (body.querySelector('button') ?? crumbs.querySelector('button:last-of-type'))?.focus({ preventScroll: true });
  }

  function crumb(text, to) {
    if (!to) {
      const here = make('span', 'bk__crumb', text);
      here.setAttribute('aria-current', 'page');
      return here;
    }
    const back = make('button', 'bk__crumb', text);
    back.type = 'button';
    back.addEventListener('click', () => go(to));
    return back;
  }

  function draw() {
    const [key, id] = path;
    const line = lines.find((each) => each.key === key);
    const rows = key ? behind(key) : [];
    const chosen = id ? ENTRIES.find((entry) => entry.id === id) : null;

    crumbs.replaceChildren(crumb('Profit and loss', key ? [] : null));
    if (line) crumbs.append(crumb(line.name, chosen ? [key] : null));
    if (chosen) crumbs.append(crumb(chosen.what, null));

    if (chosen) {
      const table = make('table', 'bk__entry');
      const head = table.createTHead().insertRow();
      for (const name of ['Account', 'Debit', 'Credit']) head.append(make('th', '', name));
      const tbody = table.createTBody();
      for (const { account, debit, credit } of chosen.lines) {
        const tr = tbody.insertRow();
        tr.append(make('td', '', account), make('td', '', debit ? pounds(debit) : ''), make('td', '', credit ? pounds(credit) : ''));
      }
      const foot = table.createTFoot().insertRow();
      const total = chosen.lines.reduce((sum, each) => sum + each.debit, 0);
      foot.append(make('td', '', 'Balanced'), make('td', '', pounds(total)), make('td', '', pounds(total)));
      const meta = make('p', 'bk__meta');
      meta.append(make('span', '', `${chosen.day} ${MONTH}`), make('span', 'bk__tag', chosen.project));
      body.replaceChildren(meta, table);
      status.textContent = `${chosen.what}, ${chosen.day} ${MONTH}: ${chosen.lines.length} lines, balanced at ${pounds(total)}.`;
    } else if (line) {
      body.replaceChildren(
        ...rows.map(({ entry, pence }) =>
          row([make('span', 'bk__day', `${entry.day} ${MONTH}`), make('span', 'bk__what', entry.what), make('span', 'bk__tag', entry.project)], pounds(pence), () => go([key, entry.id])),
        ),
        row([make('span', 'bk__what bk__what--total', `${rows.length} entries`)], pounds(line.pence), null),
      );
      status.textContent = `${line.name}: ${rows.length} entries, ${pounds(line.pence)} in all.`;
    } else {
      body.replaceChildren(
        ...lines.map(({ key: each, name, pence }) =>
          each === 'profit'
            ? row([make('span', 'bk__what bk__what--total', name)], pounds(pence), null)
            : row([make('span', 'bk__what', name)], pounds(pence), () => go([each])),
        ),
      );
      status.textContent = '';
    }
    body.dataset.depth = String(path.length);
  }

  draw();
  return { open: (next) => go(next, { focus: false }) };
}
