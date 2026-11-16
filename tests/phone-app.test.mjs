// Checks on the app that runs in the three Money Tycoon phones: its screens and its presses.
// Run with: node --test tests/
//
// The owner's brief (15 November 2026): "Add something real into the screens so
// the phones can actually be used e.g. in Mogul Bank screen i can scroll to
// Cards, loans, Move and Reserve, In Exchange i can similarly go to other pages
// etc." These tests press the phones the way a visitor would: they read the
// buttons out of each screen's markup and press those, never a made-up press.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DESKS, TABS, openApp, press, screenOf, tick, view } from '../js/phone-app.js';
import { netWorth } from '../js/phone-wallet.js';

const HOME = 0;
const EXCHANGE = 1;
const BANK = 2;

const plain = (text) => text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
/** The buttons a screen shows that can be pressed: [press, what it is on]. Under a question, only the question's. */
const buttons = (html) =>
  [...(html.includes('class="a-page" inert') ? html.slice(html.indexOf('<div class="a-ask"')) : html).matchAll(/<button[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => !/\sdisabled/.test(tag))
    .map((tag) => [tag.match(/data-do="([^"]+)"/)?.[1], tag.match(/data-arg="([^"]*)"/)?.[1]])
    .map(([name, arg]) => [name, arg === undefined ? undefined : plain(arg)]);
/** The words on a screen, without its markup. */
const words = (html) => plain(html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
const on = (app, index) => words(view(app, index));
/** Press a run of buttons on one phone, each of which must be on the screen when it is pressed. */
function pressAll(app, index, ...run) {
  return run.reduce((now, [name, arg]) => {
    const shown = buttons(view(now, index)).some(([has, its]) => has === name && String(its) === String(arg));
    assert.ok(shown, `no "${name}${arg === undefined ? '' : ` ${arg}`}" button on ${screenOf(now, index).name}`);
    return press(now, index, name, arg);
  }, app);
}
const everything = (wallet) => netWorth(wallet) + wallet.escrow;

test('the phones open on the three screens they were photographed on', () => {
  const app = openApp();
  assert.deepEqual([0, 1, 2].map((index) => screenOf(app, index).name), ['home', 'exchange', 'bank']);
  assert.match(on(app, HOME), /Welcome back, Alex Morgan .* Total net worth \$ 5\.7m/);
  assert.match(on(app, EXCHANGE), /Mogul Exchange Live Your stakes \$160,000 Monthly payouts \+\$800\/mo Stakes 1 \$800 ready Collect/);
  assert.match(on(app, BANK), /Mogul Bank .* Total position \$5\.7m .* Cash \+ savings \$3\.2m Assets \$2\.5m Owed \$0/);
});

test('every button on every screen a visitor can reach does something, and none makes or loses money', () => {
  const refusals = /^(Not Qualified|Quit Current Job First|Not enough cash for this (bid|order)|You hold \d+ BTC|Insufficient funds for this transaction\.)$/;
  const reached = new Set();
  let pressed = 0;
  for (const index of [HOME, EXCHANGE, BANK]) {
    const seen = new Set();
    const queue = [openApp()];
    while (queue.length) {
      const app = queue.pop();
      const html = view(app, index);
      const key = html.replace(/\d+/g, '#'); // two screens that differ only in their figures are one screen
      if (seen.has(key)) continue;
      seen.add(key);
      reached.add(screenOf(app, index).name);

      assert.ok(!html.includes('style='), `inline style on ${screenOf(app, index).name}: the content policy forbids it`);
      assert.equal(html.match(/class="a-tab[ "]/g).length, TABS.length);
      assert.equal(html.match(/class="a-tab is-on"/g).length, 1);
      assert.ok([5_700_000, 5_700_800].includes(everything(app.wallet)), `money made or lost: ${everything(app.wallet)}`);
      if (app.phones[index].note) assert.match(app.phones[index].note, refusals);

      for (const [name, arg] of buttons(html)) {
        assert.ok(name, `a button with nothing to do on ${screenOf(app, index).name}`);
        pressed += 1;
        queue.push(press(app, index, name, arg));
      }
    }
  }
  assert.deepEqual(
    [...reached].sort(),
    ['activity', 'auction', 'bank', 'business', 'buy', 'cards', 'catalog', 'exchange', 'expenses', 'floor', 'home', 'invest', 'jobs', 'loans', 'lot', 'market', 'retirement', 'transactions'],
  );
  assert.ok(pressed > 1_000, `only ${pressed} buttons pressed`);
});

test('a press changes the phone it was on, and the wallet all three share', () => {
  const before = openApp();
  const after = pressAll(before, BANK, ['desk', 'Cards']);
  assert.equal(after.phones[BANK].desk, 'Cards');
  assert.equal(after.phones[HOME], before.phones[HOME]);
  assert.equal(after.phones[EXCHANGE], before.phones[EXCHANGE]);
  assert.equal(before.phones[BANK].desk, 'Accounts'); // the app before the press is as it was
});

test('the five tabs lead to the five screens, and pressing the tab you are on goes back to its first screen', () => {
  let app = openApp();
  for (const [key, label] of TABS) {
    app = pressAll(app, HOME, ['tab', key]);
    assert.equal(screenOf(app, HOME).name, key);
    assert.match(view(app, HOME), new RegExp(`class="a-tab is-on"[^>]*aria-pressed="true">.*?<span>${label}</span>`));
  }
  app = pressAll(app, EXCHANGE, ['open', 'market']);
  assert.equal(screenOf(app, EXCHANGE).name, 'market');
  app = pressAll(app, EXCHANGE, ['tab', 'bank'], ['tab', 'invest']);
  assert.equal(screenOf(app, EXCHANGE).name, 'market'); // a tab keeps its place while you are away
  app = pressAll(app, EXCHANGE, ['tab', 'invest']);
  assert.equal(screenOf(app, EXCHANGE).name, 'invest');
});

test('the Bank has its five desks, and each shows its own things', () => {
  const shows = {
    Accounts: /Holdings Everyday Cash Instant · no fees \$2\.0m Reserve Savings 5\.0% APY · \$5,167\/mo \$1\.2m Deposit Withdraw/,
    Cards: /Cards · 0 Apply for your first card/,
    Loans: /Pre-qualified · Score checked Mortgage Up to \$1\.0m · 6\.5% APR · 360 mo Business Loan Up to \$500\.0k · 9\.0% APR · 120 mo Active · 0 No facilities — view offers/,
    Move: /Transfer Everyday Cash \$2\.0m Reserve Savings Earns interest 25% 50% 75% Max \$500 − \+ Within \$2\.0m available · settles instantly Review transfer/,
    Reserve: /Retirement Accounts Total balance \$0 Manage your accounts/,
  };
  assert.deepEqual(Object.keys(shows), [...DESKS]);
  let app = openApp();
  for (const desk of DESKS) {
    app = pressAll(app, BANK, ['desk', desk]);
    assert.match(on(app, BANK), shows[desk]);
    assert.match(on(app, BANK), /Statements & Records Transactions .* Open Expenses .* Open/); // under every desk
    assert.match(view(app, BANK), new RegExp(`class="a-choice is-on"[^>]*aria-pressed="true">${desk}<`));
  }
});

test('the Bank’s desks open the screens behind them, and each comes back', () => {
  const behind = [
    ['Cards', 'cards', /Credit Cards No cards yet .* Apply for a New Card Basic Gold Platinum Black/],
    ['Loans', 'loans', /Loans & Debt Debt Free! .* 8 loan types available Personal Loan Up to \$50\.0k · 12\.0% APR · 60 mo/],
    ['Reserve', 'retirement', /Retirement Accounts Contribute to tax-advantaged accounts 401\(k\) \$0 balance Traditional IRA \$0 balance Roth IRA \$0 balance HSA \$0 balance/],
    ['Accounts', 'transactions', /Transactions Interest Reserve Savings \+\$5,167 Paycheck Software Engineer \+\$7,500 Living costs Housing, food and other -\$32,200/],
    ['Accounts', 'expenses', /Expenses Monthly Expenses -\$32\.2k Housing \$12\.0k Food \$3,200 Other \$17\.0k/],
  ];
  for (const [desk, screen, shows] of behind) {
    const app = pressAll(openApp(), BANK, ['desk', desk], ['open', screen]);
    assert.equal(screenOf(app, BANK).name, screen);
    assert.match(on(app, BANK), shows);
    const back = pressAll(app, BANK, ['back', undefined]);
    assert.equal(screenOf(back, BANK).name, 'bank');
    assert.equal(back.phones[BANK].desk, desk);
  }
});

test('a transfer goes from the Move desk, through its question, to every phone', () => {
  let app = pressAll(openApp(), BANK, ['desk', 'Move'], ['chip', '0'], ['nudge', '100'], ['review', undefined]);
  assert.match(on(app, BANK), /Move \$490,100 to Reserve Savings\? The transfer settles instantly\. Cancel Transfer/);
  assert.equal(app.wallet.cash, 1_960_000); // asked, not yet done

  const cancelled = pressAll(app, BANK, ['dismiss', undefined]);
  assert.equal(cancelled.wallet, app.wallet);
  assert.equal(cancelled.phones[BANK].alert, null);

  app = pressAll(app, BANK, ['transfer', undefined]);
  assert.equal(app.wallet.cash, 1_469_900);
  assert.equal(app.wallet.reserve, 1_730_100);
  assert.equal(app.phones[BANK].alert, null);
  assert.match(on(app, HOME), /Balances Cash \$1\.5m Reserve \$1\.7m/);
  assert.match(on(app, HOME), /Total net worth \$ 5\.7m/); // moved, not made
  app = pressAll(app, BANK, ['open', 'transactions']);
  assert.match(on(app, BANK), /Transactions Transfer to Reserve Savings Everyday Cash -\$490,100 Interest/);
});

test('a question is answered before anything else is pressed', () => {
  const asked = pressAll(openApp(), BANK, ['desk', 'Move'], ['review', undefined]);
  assert.deepEqual(buttons(view(asked, BANK)), [['dismiss', undefined], ['transfer', undefined]]);
  assert.match(view(asked, BANK), /<div class="a-page" inert>/);
  assert.equal(press(asked, BANK, 'tab', 'home'), asked); // the screen under the question does not answer
  assert.equal(press(asked, BANK, 'desk', 'Cards'), asked);
  assert.equal(press(asked, HOME, 'tab', 'jobs').phones[HOME].tab, 'jobs'); // the other phones are not held up
  assert.doesNotMatch(view(openApp(), BANK), /inert/);
  assert.throws(() => press(openApp(), BANK, 'transfer'), /answers a question that was not asked/);
  assert.throws(() => press(asked, BANK, 'placeBid') && press(openApp(), EXCHANGE, 'placeBid'), /answers a question that was not asked/);
});

test('Deposit and Withdraw lead to the Move desk, pointed the right way', () => {
  const deposit = pressAll(openApp(), BANK, ['deposit', undefined]);
  assert.match(on(deposit, BANK), /Transfer Everyday Cash \$2\.0m Reserve Savings Earns interest/);
  const withdraw = pressAll(openApp(), BANK, ['withdraw', undefined]);
  assert.match(on(withdraw, BANK), /Transfer Reserve Savings \$1\.2m Everyday Cash Instant/);
  const swapped = pressAll(withdraw, BANK, ['swap', undefined], ['chip', '3'], ['review', undefined], ['transfer', undefined]);
  assert.equal(swapped.wallet.cash, 0);
  assert.equal(swapped.wallet.reserve, 3_200_000);
});

test('the Move desk will not review more than there is, or nothing', () => {
  let app = pressAll(openApp(), BANK, ['withdraw', undefined], ['chip', '3'], ['nudge', '100']);
  assert.match(on(app, BANK), /\$1,240,100 − \+ Exceeds available — lower the amount Review transfer/);
  assert.ok(!buttons(view(app, BANK)).some(([name]) => name === 'review'), 'Review transfer should be switched off');
  assert.equal(press(app, BANK, 'review').phones[BANK].alert, null); // and pressing it anyway asks nothing

  app = pressAll(openApp(), BANK, ['desk', 'Move']);
  for (let times = 0; times < 6; times += 1) app = pressAll(app, BANK, ['nudge', '-100']);
  assert.equal(app.phones[BANK].amount, 0); // never below nothing
  assert.ok(!buttons(view(app, BANK)).some(([name]) => name === 'review'));
});

test('Home’s desks lead to the Bank and to the Exchange', () => {
  const banked = pressAll(openApp(), HOME, ['go', 'Accounts']);
  assert.equal(screenOf(banked, HOME).name, 'bank');
  const traded = pressAll(openApp(), HOME, ['go', 'exchange']);
  assert.equal(screenOf(traded, HOME).name, 'exchange');
  assert.match(view(traded, HOME), /class="a-tab is-on"[^>]*>.*?<span>Invest<\/span>/);
});

test('Home’s ranges and cash-flow views switch', () => {
  let app = openApp();
  assert.match(on(app, HOME), /\+\$1\.2m this range · Oct Y2 → Jan Y3/);
  app = pressAll(app, HOME, ['range', 'All']);
  assert.match(on(app, HOME), /\+\$5\.7m this range · Jan Y1 → Jan Y3/);
  assert.match(on(app, HOME), /Month to date · month 1, year 3 .* Income \+\$44\.4k Expenses -\$32\.2k Net Flow \+\$12\.2k/);
  app = pressAll(app, HOME, ['flow', 'Expected']);
  assert.match(on(app, HOME), /Projected · month 1, year 3/);
});

test('dividends are collected once, from Home or from the Exchange', () => {
  for (const index of [HOME, EXCHANGE]) {
    const app = pressAll(openApp(), index, ['collect', undefined]);
    assert.equal(app.wallet.cash, 1_960_800);
    assert.equal(app.wallet.ready, 0);
    assert.ok(!buttons(view(app, HOME)).some(([name]) => name === 'collect'), 'Claim should be gone from Home');
    assert.ok(!buttons(view(app, EXCHANGE)).some(([name]) => name === 'collect'), 'Collect should be gone from the Exchange');
    assert.match(on(app, EXCHANGE), /Venues .* Collect Dividends Claim accrued payouts from your passive stakes/);
    const activity = pressAll(app, EXCHANGE, ['open', 'activity']);
    assert.match(on(activity, EXCHANGE), /Activity Dividend claimed Mogul Exchange \+\$800/);
  }
  const empty = pressAll(openApp(), EXCHANGE, ['open', 'activity']);
  assert.match(on(empty, EXCHANGE), /Activity No activity yet/);
});

test('a stake is bought on the Marketplace and shows up everywhere it should', () => {
  let app = pressAll(openApp(), EXCHANGE, ['open', 'market']);
  assert.match(on(app, EXCHANGE), /Marketplace Online · 3 listings Board My Portfolio Dividends List My Stakes Northside Car Wash Business Stake · Ava Equity 10\.0% Price \$95\.0k Monthly \$640\/mo Yield 8\.1%/);
  app = pressAll(app, EXCHANGE, ['open', 'buy:car-wash']);
  assert.match(on(app, EXCHANGE), /Confirm Purchase Northside Car Wash 10\.0% Equity Stake Seller: Ava Payment Method Cash \$2\.0m available Listing Price \$95,000 .* Total Due \$95,000 Confirm & Pay/);
  app = pressAll(app, EXCHANGE, ['pay', 'car-wash']);
  assert.equal(app.wallet.cash, 1_865_000);
  assert.equal(screenOf(app, EXCHANGE).name, 'market');
  assert.match(on(app, EXCHANGE), /Online · 2 listings .* Corner Bakery 20% Equity Stake \$160\.0k \+\$800\/mo Northside Car Wash 10% Equity Stake \$95\.0k \+\$640\/mo/);
  app = pressAll(app, EXCHANGE, ['board', 'Board']);
  assert.doesNotMatch(on(app, EXCHANGE), /Northside Car Wash/); // sold: off the board
  app = pressAll(app, EXCHANGE, ['back', undefined]);
  assert.match(on(app, EXCHANGE), /Your stakes \$255,000 Monthly payouts \+\$1,440\/mo Stakes 2/);
  assert.match(on(pressAll(app, HOME, ['tab', 'business']), HOME), /Northside Car Wash 10% owned Pays \$640\/mo Stake/);
});

test('a stake that costs more than the cash in hand cannot be paid for', () => {
  let app = pressAll(openApp(), BANK, ['deposit', undefined], ['chip', '3'], ['review', undefined], ['transfer', undefined]);
  app = pressAll(app, EXCHANGE, ['open', 'market'], ['open', 'buy:studio']);
  assert.match(on(app, EXCHANGE), /Insufficient funds for this transaction\. Confirm & Pay/);
  assert.ok(!buttons(view(app, EXCHANGE)).some(([name]) => name === 'pay'));
  const refused = press(app, EXCHANGE, 'pay', 'studio'); // and pressing it anyway buys nothing
  assert.equal(refused.wallet, app.wallet);
  assert.equal(refused.phones[EXCHANGE].note, 'Insufficient funds for this transaction.');
  assert.match(view(refused, EXCHANGE), /<p class="a-note" role="status">Insufficient funds for this transaction\.<\/p>/);
  assert.equal(pressAll(refused, EXCHANGE, ['back', undefined]).phones[EXCHANGE].note, ''); // a note lasts until the next press
});

test('a bid is asked about, held in escrow, and raised', () => {
  let app = pressAll(openApp(), EXCHANGE, ['open', 'auction']);
  assert.match(on(app, EXCHANGE), /Auction House Live My Bids My Listings Sell Riverside Diner 2h left 25% stake 7 bids Reserve met Leo Current \$48,500 Buy now \$70\.0k Maple Street Duplex 1d left 10% stake 3 bids Noor Current \$31,000/);
  app = pressAll(app, EXCHANGE, ['lot', 'diner']);
  assert.match(on(app, EXCHANGE), /Riverside Diner 2h left Equity 25% stake Fair value \$66,000 Monthly income \$410\/mo Current bid 7 bids \$48,500 Quick bid Min \+5% \+10% \$49,000 Bid at least \$49,000 Place Bid/);
  app = pressAll(app, EXCHANGE, ['raise', '10']);
  assert.equal(app.phones[EXCHANGE].bid, 53_900);
  app = pressAll(app, EXCHANGE, ['bid', undefined]);
  assert.match(on(app, EXCHANGE), /Confirm your bid \$53,900 is held in escrow when placed\. Cancel Place Bid/);
  assert.equal(app.wallet.escrow, 0);
  app = pressAll(app, EXCHANGE, ['placeBid', undefined]);
  assert.equal(app.wallet.cash, 1_906_100);
  assert.equal(app.wallet.escrow, 53_900);
  assert.match(on(app, EXCHANGE), /You’re winning .* Current bid 8 bids \$53,900 .* Bid at least \$54,400/);

  app = pressAll(app, EXCHANGE, ['bid', undefined], ['placeBid', undefined]); // raise our own bid: the first comes back
  assert.equal(app.wallet.escrow, 54_400);
  assert.equal(app.wallet.cash, 1_905_600);
  app = pressAll(app, EXCHANGE, ['back', undefined]);
  assert.match(on(app, EXCHANGE), /\$54,400 held in Exchange escrow Released if outbid\. Not counted in net worth until released\./);
  assert.match(on(pressAll(app, EXCHANGE, ['hall', 'My Bids']), EXCHANGE), /Riverside Diner 25% stake · your bid \$54,400 Winning/);
  assert.match(on(pressAll(openApp(), EXCHANGE, ['open', 'auction'], ['hall', 'My Bids']), EXCHANGE), /You haven’t bid on anything yet/);
});

test('coins are bought and sold on the Trading Floor', () => {
  let app = pressAll(openApp(), EXCHANGE, ['open', 'floor']);
  assert.match(on(app, EXCHANGE), /Trading Floor BTC Bitcoin \$45,000 ▲ \+1\.25% Bid \$44,990 Ask \$45,010 .* Place order Buy Sell Your position 0 BTC Quantity 1 − \+ Total \$45,000 Place buy order/);
  assert.match(on(app, EXCHANGE), /Simulated market — fictional in-game prices, in-game cash only\. Not real cryptocurrency, not financial advice\./);
  app = pressAll(app, EXCHANGE, ['quantity', '1'], ['quantity', '1'], ['order', undefined]);
  assert.equal(app.wallet.coins, 3);
  assert.equal(app.wallet.cash, 1_825_000);
  assert.match(on(pressAll(app, HOME, ['tab', 'invest']), HOME), /Positions 4 .* BTC 3 \$135\.0k/);

  app = pressAll(app, EXCHANGE, ['side', 'Sell'], ['quantity', '1'], ['order', undefined]);
  assert.equal(app.phones[EXCHANGE].note, 'You hold 3 BTC'); // four asked for, three held
  assert.equal(app.wallet.coins, 3);
  app = pressAll(app, EXCHANGE, ['quantity', '-1'], ['order', undefined]);
  assert.equal(app.wallet.coins, 0);
  assert.equal(app.wallet.cash, 1_960_000);
  for (let times = 0; times < 5; times += 1) app = pressAll(app, EXCHANGE, ['quantity', '-1']);
  assert.equal(app.phones[EXCHANGE].quantity, 1); // never fewer than one
});

test('a job is left and another taken', () => {
  let app = pressAll(openApp(), HOME, ['tab', 'jobs']);
  assert.match(on(app, HOME), /Jobs Current Position Software Engineer Take-home per month \$7,500 14 mo employed · Performance 72 .* Quit/);
  assert.doesNotMatch(on(app, HOME), /Available Positions/);
  app = pressAll(app, HOME, ['quit', undefined]);
  assert.match(on(app, HOME), /Get a job .* Available Positions IT Support Specialist Entry Level • Technology \$3,500 \/month .* CTO C-Suite • Technology Requires: MBA \$40,000 \/month/);
  assert.match(on(pressAll(app, HOME, ['tab', 'home']), HOME), /Income \+\$36\.9k/); // the paycheck is gone from Home

  const refused = pressAll(app, HOME, ['apply', 'CTO']);
  assert.equal(refused.wallet.job, null);
  assert.equal(refused.phones[HOME].note, 'Not Qualified');
  app = pressAll(app, HOME, ['apply', 'Registered Nurse']);
  assert.match(on(app, HOME), /Current Position Registered Nurse Take-home per month \$6,000/);
});

test('the businesses are sorted four ways, and the market lists what can be started', () => {
  let app = pressAll(openApp(), HOME, ['tab', 'business']);
  assert.match(on(app, HOME), /Business Empire This month’s net \+\$31\.7k Valuation \$1\.6m Revenue \+\$62\.4k Expenses \$30\.7k Holdings Name Coffee Shop Level 3 Demand 68 · Standard Bronze Revenue \$9,600 Expenses \$6,100 Profit \+\$3,500 Software Agency/);
  app = pressAll(app, HOME, ['sort', undefined]);
  assert.match(on(app, HOME), /Holdings Revenue Software Agency Level 5 Demand 74 · Prime Silver Revenue \$52\.0k Expenses \$24\.6k Profit \+\$27\.4k Coffee Shop/);
  app = pressAll(app, HOME, ['sort', undefined], ['sort', undefined], ['sort', undefined]);
  assert.equal(app.phones[HOME].sort, 'Name'); // round again
  app = pressAll(app, HOME, ['open', 'catalog']);
  assert.match(on(app, HOME), /Business market E-Commerce Store \+\$15\.0k\/mo revenue \$30\.0k .* Airline \+\$1\.8m\/mo revenue \$25\.0m/);
});

test('Invest shows the portfolio and leads to the Exchange', () => {
  const app = pressAll(openApp(), HOME, ['tab', 'invest']);
  assert.match(on(app, HOME), /Invest Portfolio \$860\.0k ▲ \$41\.7k · \+8\.7% unrealized Stocks Crypto Property Passive income \+\$800\/mo Positions 3 Desks Mogul Exchange Live .* Positions NVDA 240 shares · Avg\. cost \$790 \$210\.0k \+\$20\.4k/);
  assert.equal(screenOf(pressAll(app, HOME, ['open', 'exchange']), HOME).name, 'exchange');
});

test('the clock counts a game day down, turns the month and the year, and can be paused', () => {
  let app = openApp();
  assert.match(on(app, HOME), /14 2 January Running · Year 3/);
  app = tick(app);
  assert.equal(app.clock.seconds, 13);
  for (let seconds = 0; seconds < 13; seconds += 1) app = tick(app);
  assert.deepEqual({ ...app.clock }, { day: 3, month: 0, year: 3, seconds: 15, paused: false });
  for (let seconds = 0; seconds < 15 * 28; seconds += 1) app = tick(app);
  assert.deepEqual([app.clock.day, app.clock.month, app.clock.year], [1, 1, 3]); // thirty days to a game month
  for (let seconds = 0; seconds < 15 * 30 * 11; seconds += 1) app = tick(app);
  assert.deepEqual([app.clock.day, app.clock.month, app.clock.year], [1, 0, 4]);
  assert.match(on(app, HOME), /1 January Running · Year 4/);

  const paused = pressAll(app, HOME, ['pause', undefined]);
  assert.match(on(paused, HOME), /1 January Paused/);
  assert.equal(tick(paused), paused); // a paused clock does not move
  assert.equal(pressAll(paused, HOME, ['pause', undefined]).clock.paused, false);
});

test('text that comes from data cannot carry markup', () => {
  const app = openApp();
  const spiked = { ...app, wallet: { ...app.wallet, ledger: [{ title: '<img src=x onerror=alert(1)>', amount: 1, from: '"&' }] } };
  const html = view(pressAll(spiked, BANK, ['open', 'transactions']), BANK);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&quot;&amp;'));
});

test('a press or a screen that does not exist is a mistake, not a note', () => {
  const app = openApp();
  assert.throws(() => press(app, HOME, 'fly'), /do not know the press "fly"/);
  assert.throws(() => press(app, HOME, 'tab', 'games'), /No tab called games/);
  assert.throws(() => press(app, BANK, 'desk', 'Vault'), /No desk called Vault/);
  assert.throws(() => press(app, BANK, 'open', 'vault'), /No screen called vault/);
});
