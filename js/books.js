// The sample books shown on the CapitalCraft Books sheet: a month of
// double-entry, the statement made from it, and the way from any figure down
// to the entries behind it. Nothing here touches the page, so the same code
// runs in the browser (js/books-view.js draws it) and in Node
// (tests/books.test.mjs).
//
// The figures are made up for the page. Money is kept in whole pence and never
// as a fraction of a pound: 0.1 + 0.2 is not 0.3 in a computer's arithmetic,
// and books have to add up.

/** Each account, and the figure on the statement it belongs to (null: it never reaches the statement). */
export const ACCOUNTS = Object.freeze({
  Sales: 'income',
  'App store income': 'income',
  Contractors: 'cost',
  'Store fees': 'cost',
  Hosting: 'overheads',
  Software: 'overheads',
  Insurance: 'overheads',
  Bank: null,
  Debtors: null,
  Creditors: null,
  VAT: null,
});

const FIGURES = Object.freeze([
  { key: 'income', name: 'Income' },
  { key: 'cost', name: 'Cost of sales' },
  { key: 'overheads', name: 'Overheads' },
]);

const line = (account, debit, credit) => Object.freeze({ account, debit, credit });
const entry = (id, day, what, project, lines) => Object.freeze({ id, day, what, project, lines: Object.freeze(lines) });

/** A sample month, in date order. `day` is the day of the month; amounts are pence. */
export const ENTRIES = Object.freeze([
  entry('inv-1', 3, 'Invoice: website build', 'Client website', [line('Debtors', 576000, 0), line('Sales', 0, 480000), line('VAT', 0, 96000)]),
  entry('bill-1', 5, 'Bill: illustration', 'Mobile game', [line('Contractors', 180000, 0), line('Creditors', 0, 180000)]),
  entry('bill-2', 8, 'Bill: game servers', 'Mobile game', [line('Hosting', 24000, 0), line('VAT', 4800, 0), line('Creditors', 0, 28800)]),
  entry('pay-1', 11, 'Software licences', 'Studio', [line('Software', 31000, 0), line('VAT', 6200, 0), line('Bank', 0, 37200)]),
  entry('store-1', 14, 'App store payout', 'Mobile game', [line('Bank', 315000, 0), line('Store fees', 135000, 0), line('App store income', 0, 450000)]),
  entry('inv-2', 17, 'Invoice: CRM, stage one', 'Client CRM', [line('Debtors', 720000, 0), line('Sales', 0, 600000), line('VAT', 0, 120000)]),
  entry('pay-2', 20, 'Insurance', 'Studio', [line('Insurance', 18500, 0), line('Bank', 0, 18500)]),
  entry('bill-3', 24, 'Bill: testing', 'Client CRM', [line('Contractors', 95000, 0), line('Creditors', 0, 95000)]),
  entry('pay-3', 27, 'Website hosting', 'Client website', [line('Hosting', 6000, 0), line('VAT', 1200, 0), line('Bank', 0, 7200)]),
]);

/** True if an entry's debits equal its credits. */
export function balanced({ lines }) {
  return lines.reduce((sum, { debit, credit }) => sum + debit - credit, 0) === 0;
}

/** What one entry adds to a figure, in pence: income counts credits, costs count debits. */
function share(key, { lines }) {
  const sign = key === 'income' ? -1 : 1;
  return lines.reduce((sum, { account, debit, credit }) => (ACCOUNTS[account] === key ? sum + sign * (debit - credit) : sum), 0);
}

const touches = (key, { lines }) => lines.some(({ account }) => ACCOUNTS[account] === key);

/**
 * The profit and loss statement for a set of entries.
 * @returns {{ key: string, name: string, pence: number }[]} income, cost of sales, overheads, then profit
 */
export function statement(entries = ENTRIES) {
  const figures = FIGURES.map(({ key, name }) => ({ key, name, pence: entries.reduce((sum, each) => sum + share(key, each), 0) }));
  const [income, cost, overheads] = figures.map((figure) => figure.pence);
  return [...figures, { key: 'profit', name: 'Profit', pence: income - cost - overheads }];
}

/**
 * The entries behind one figure of the statement, and what each adds to it.
 * They add up to the figure exactly.
 * @returns {{ entry: object, pence: number }[]}
 */
export function behind(key, entries = ENTRIES) {
  if (!FIGURES.some((figure) => figure.key === key)) {
    throw new RangeError(`There are no entries behind "${key}": it is not a figure made of entries.`);
  }
  return entries.filter((each) => touches(key, each)).map((each) => ({ entry: each, pence: share(key, each) }));
}

/** Pence written as pounds: 123456 is "1,234.56". */
export function pounds(pence) {
  if (!Number.isInteger(pence)) throw new RangeError(`Money is kept in whole pence; got ${pence}.`);
  const whole = Math.floor(Math.abs(pence) / 100);
  const rest = String(Math.abs(pence) % 100).padStart(2, '0');
  return `${pence < 0 ? '−' : ''}${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${rest}`;
}
