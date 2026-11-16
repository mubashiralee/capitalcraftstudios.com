// The sample books shown on the CapitalCraft Books sheet (js/books.js): a
// month of double-entry in whole pence, the statement made from it, and the
// way from any figure down to the entries behind it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { ACCOUNTS, ENTRIES, balanced, behind, pounds, statement } from '../js/books.js';

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const figure = (lines, key) => lines.find((line) => line.key === key).pence;

test('the statement the page comes with (before any script runs) shows the same figures as the sample books', () => {
  const shown = [...page.matchAll(/data-figure="([a-z]+)">([^<]+)</g)].map(([, key, text]) => [key, text]);
  assert.deepEqual(shown, statement().map((line) => [line.key, pounds(line.pence)]));
});

test('every sample entry is proper double entry: whole pence, one side to a line, and debits equal to credits', () => {
  assert.ok(ENTRIES.length >= 8);
  assert.equal(new Set(ENTRIES.map((entry) => entry.id)).size, ENTRIES.length, 'two entries share an id');
  for (const entry of ENTRIES) {
    assert.ok(entry.lines.length >= 2, `${entry.what}: an entry has at least two lines`);
    for (const line of entry.lines) {
      assert.ok(line.account in ACCOUNTS, `${entry.what}: there is no account called "${line.account}"`);
      assert.ok(Number.isInteger(line.debit) && Number.isInteger(line.credit), `${entry.what}: ${line.account} is not in whole pence`);
      assert.ok(line.debit >= 0 && line.credit >= 0, `${entry.what}: ${line.account} has a negative side`);
      assert.ok((line.debit > 0) !== (line.credit > 0), `${entry.what}: ${line.account} must have exactly one side`);
    }
    assert.ok(balanced(entry), `${entry.what} does not balance`);
    assert.ok(entry.project.length > 0, `${entry.what} is not tagged to a project`);
    assert.ok(Number.isInteger(entry.day) && entry.day >= 1 && entry.day <= 30, `${entry.what}: day ${entry.day}`);
  }
  assert.deepEqual(ENTRIES.map((entry) => entry.day), [...ENTRIES.map((entry) => entry.day)].sort((a, b) => a - b), 'the entries are in date order');
});

test('an entry whose sides differ by a penny does not balance', () => {
  const entry = { lines: [{ account: 'Hosting', debit: 12000, credit: 0 }, { account: 'Bank', debit: 0, credit: 11999 }] };
  assert.equal(balanced(entry), false);
  entry.lines[1].credit = 12000;
  assert.equal(balanced(entry), true);
});

test('the statement, worked by hand from the sample entries', () => {
  const lines = statement();
  assert.deepEqual(lines.map((line) => line.key), ['income', 'cost', 'overheads', 'profit']);
  assert.deepEqual(lines.map((line) => line.name), ['Income', 'Cost of sales', 'Overheads', 'Profit']);
  // Income: invoices of 4,800.00 and 6,000.00 before VAT, and 4,500.00 from the app stores.
  assert.equal(figure(lines, 'income'), 1530000);
  // Cost of sales: store fees 1,350.00, contractors 1,800.00 and 950.00.
  assert.equal(figure(lines, 'cost'), 410000);
  // Overheads: hosting 240.00 and 60.00, software 310.00, insurance 185.00.
  assert.equal(figure(lines, 'overheads'), 79500);
  assert.equal(figure(lines, 'profit'), 1530000 - 410000 - 79500);
});

test('VAT, the bank and what is owed never reach the statement', () => {
  const entries = [
    { id: 'a', day: 1, what: 'A bill with VAT', project: 'Studio', lines: [
      { account: 'Software', debit: 10000, credit: 0 },
      { account: 'VAT', debit: 2000, credit: 0 },
      { account: 'Creditors', debit: 0, credit: 12000 },
    ] },
    { id: 'b', day: 2, what: 'Paying it', project: 'Studio', lines: [
      { account: 'Creditors', debit: 12000, credit: 0 },
      { account: 'Bank', debit: 0, credit: 12000 },
    ] },
  ];
  const lines = statement(entries);
  assert.equal(figure(lines, 'income'), 0);
  assert.equal(figure(lines, 'overheads'), 10000);
  assert.equal(figure(lines, 'profit'), -10000);
  assert.deepEqual(behind('overheads', entries).map((row) => row.entry.id), ['a'], 'paying a bill is not a second cost');
});

test('every figure on the statement is the sum of the entries behind it, to the penny', () => {
  const lines = statement();
  for (const key of ['income', 'cost', 'overheads']) {
    const rows = behind(key);
    assert.ok(rows.length >= 2, `${key}: ${rows.length} entries behind it`);
    assert.equal(rows.reduce((sum, row) => sum + row.pence, 0), figure(lines, key), key);
    for (const row of rows) {
      assert.ok(ENTRIES.includes(row.entry));
      assert.ok(row.pence !== 0, `${row.entry.what} adds nothing to ${key}`);
    }
  }
  // Between them the three figures use every entry that touches income or a cost, once each.
  const used = ['income', 'cost', 'overheads'].flatMap((key) => behind(key).map((row) => `${key}/${row.entry.id}`));
  assert.equal(new Set(used).size, used.length);
});

test('one entry can stand behind two figures: an app store payout is income, and its fee is a cost', () => {
  const payout = ENTRIES.find((entry) => entry.lines.some((line) => line.account === 'Store fees'));
  assert.equal(behind('income').find((row) => row.entry === payout).pence, 450000);
  assert.equal(behind('cost').find((row) => row.entry === payout).pence, 135000);
});

test('a refund takes away from the figure it stands behind', () => {
  const entries = [
    { id: 'sale', day: 3, what: 'An invoice', project: 'A', lines: [{ account: 'Debtors', debit: 50000, credit: 0 }, { account: 'Sales', debit: 0, credit: 50000 }] },
    { id: 'refund', day: 9, what: 'A credit note', project: 'A', lines: [{ account: 'Sales', debit: 12000, credit: 0 }, { account: 'Debtors', debit: 0, credit: 12000 }] },
  ];
  assert.equal(figure(statement(entries), 'income'), 38000);
  assert.deepEqual(behind('income', entries).map((row) => row.pence), [50000, -12000]);
});

test('profit has no entries of its own, and a figure that does not exist is refused', () => {
  assert.throws(() => behind('profit'), RangeError);
  assert.throws(() => behind('turnover'), RangeError);
});

test('pence are written as pounds, with commas, two places and a true minus sign', () => {
  assert.equal(pounds(0), '0.00');
  assert.equal(pounds(5), '0.05');
  assert.equal(pounds(79500), '795.00');
  assert.equal(pounds(1530000), '15,300.00');
  assert.equal(pounds(123456789), '1,234,567.89');
  assert.equal(pounds(-1250), '−12.50');
  assert.equal(pounds(-5), '−0.05');
  assert.throws(() => pounds(12.5), RangeError, 'half a penny');
  assert.throws(() => pounds(Number.NaN), RangeError);
});
