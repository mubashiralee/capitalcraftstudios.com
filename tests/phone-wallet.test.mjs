// Checks on the wallet behind the three Money Tycoon phones.
// Run with: node --test tests/
//
// The owner's brief (15 November 2026): "Add something real into the screens so
// the phones can actually be used e.g. in Mogul Bank screen i can scroll to
// Cards, loans, Move and Reserve, In Exchange i can similarly go to other pages
// etc." So the phones run a small copy of the game's money rules. All three
// share one wallet: money moved in the Bank is the money Home shows.
//
// Every amount is a whole number of dollars. Nothing here may make money or
// lose it: each test that moves money also checks the total.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  COIN,
  JOBS,
  LISTINGS,
  LOANS,
  LOTS,
  POSITIONS,
  buyCoins,
  buyStake,
  cashFlow,
  collect,
  compact,
  full,
  minBid,
  monthlyInterest,
  move,
  moveChips,
  netWorth,
  openWallet,
  placeBid,
  portfolio,
  position,
  quitJob,
  sellCoins,
  signed,
  takeJob,
} from '../js/phone-wallet.js';

/** Everything the player owns or is owed back, wherever it sits: this may never change by moving it about. */
const everything = (wallet) => netWorth(wallet) + wallet.escrow;

// ---- Writing money the way the game does ----

test('short money is written as the game writes it: $9,999 in full, then $25.0k, $1.0m, $1.0bn, $1.0T', () => {
  assert.equal(compact(0), '$0');
  assert.equal(compact(950), '$950');
  assert.equal(compact(9_999), '$9,999'); // the game writes anything under ten thousand in full
  assert.equal(compact(10_000), '$10.0k');
  assert.equal(compact(25_000), '$25.0k');
  assert.equal(compact(1_000_000), '$1.0m');
  assert.equal(compact(1_960_000), '$2.0m');
  assert.equal(compact(5_700_000), '$5.7m');
  assert.equal(compact(1_000_000_000), '$1.0bn');
  assert.equal(compact(3_100_000_000), '$3.1bn');
  assert.equal(compact(1_000_000_000_000), '$1.0T');
});

test('short money never shows a thousand of a unit: it steps up to the next one', () => {
  assert.equal(compact(999_949), '$999.9k');
  assert.equal(compact(999_950), '$1.0m');
  assert.equal(compact(999_999_999), '$1.0bn');
});

test('money owed is written with its sign in front of the dollar', () => {
  assert.equal(compact(-35_200), '-$35.2k');
  assert.equal(compact(-5_167), '-$5,167');
  assert.equal(full(-1_250), '-$1,250');
  assert.equal(signed(compact, 12_000), '+$12.0k');
  assert.equal(signed(compact, -12_000), '-$12.0k');
  assert.equal(signed(full, 0), '$0');
});

test('money in full has a comma at every thousand', () => {
  assert.equal(full(160_000), '$160,000');
  assert.equal(full(5_167), '$5,167');
  assert.equal(full(800), '$800');
  assert.equal(full(1_234_567), '$1,234,567');
});

test('money is whole dollars: a fraction is refused, not rounded quietly', () => {
  assert.throws(() => compact(10.5), RangeError);
  assert.throws(() => full(Number.NaN), RangeError);
});

// ---- The wallet as it opens ----

test('the wallet opens on the figures the phones were photographed with', () => {
  const wallet = openWallet();
  assert.equal(compact(netWorth(wallet)), '$5.7m'); // Home
  assert.equal(compact(wallet.cash), '$2.0m'); // Bank: Everyday Cash
  assert.equal(compact(wallet.reserve), '$1.2m'); // Bank: Reserve Savings
  assert.equal(full(monthlyInterest(wallet.reserve)), '$5,167'); // "5.0% APY · $5,167/mo"
  const { deposits, assets, owed, total } = position(wallet);
  assert.equal(compact(deposits), '$3.2m'); // "Cash + savings"
  assert.equal(owed, 0);
  assert.equal(total, deposits + assets - owed);
  assert.equal(total, netWorth(wallet));
  assert.equal(full(wallet.stakes.reduce((sum, stake) => sum + stake.value, 0)), '$160,000'); // Exchange: Your stakes
  assert.equal(wallet.stakes.reduce((sum, stake) => sum + stake.monthly, 0), 800); // "+$800/mo"
  assert.equal(wallet.ready, 800); // "$800 ready"
});

test('a wallet cannot be changed behind the phones\' backs', () => {
  const wallet = openWallet();
  assert.throws(() => { wallet.cash = 0; }, TypeError);
  assert.throws(() => { wallet.stakes.push({}); }, TypeError);
  assert.throws(() => { wallet.ledger[0].amount = 1; }, TypeError);
});

// ---- Moving money (Bank, the Move desk) ----

test('the quick amounts are a quarter, a half, three quarters and all of what is there, rounded down', () => {
  // The game's own test: 1,234.56 available gives 308, 617 and 925. Here money is whole dollars.
  assert.deepEqual(moveChips(1_234), [308, 617, 925, 1_234]);
  assert.deepEqual(moveChips(0), [0, 0, 0, 0]);
  assert.deepEqual(moveChips(3), [0, 1, 2, 3]);
});

test('moving cash into savings takes it from one and puts it in the other, and writes it down', () => {
  const before = openWallet();
  const after = move(before, { toBank: true, amount: 500 });
  assert.equal(after.cash, before.cash - 500);
  assert.equal(after.reserve, before.reserve + 500);
  assert.equal(everything(after), everything(before));
  assert.equal(after.ledger.length, before.ledger.length + 1);
  assert.deepEqual({ ...after.ledger[0] }, { title: 'Transfer to Reserve Savings', amount: -500, from: 'Everyday Cash' });
  assert.equal(before.cash, openWallet().cash, 'the wallet it started from is left as it was');
});

test('moving savings back to cash goes the other way', () => {
  const before = openWallet();
  const after = move(before, { toBank: false, amount: 40_000 });
  assert.equal(after.cash, before.cash + 40_000);
  assert.equal(after.reserve, before.reserve - 40_000);
  assert.equal(everything(after), everything(before));
  assert.deepEqual({ ...after.ledger[0] }, { title: 'Transfer to Everyday Cash', amount: 40_000, from: 'Reserve Savings' });
});

test('every dollar can be moved, and not one more', () => {
  const wallet = openWallet();
  assert.equal(move(wallet, { toBank: true, amount: wallet.cash }).cash, 0);
  assert.throws(() => move(wallet, { toBank: true, amount: wallet.cash + 1 }), /Exceeds available/);
  assert.throws(() => move(wallet, { toBank: false, amount: wallet.reserve + 1 }), /Exceeds available/);
});

test('nothing, less than nothing and part of a dollar cannot be moved', () => {
  const wallet = openWallet();
  for (const amount of [0, -5, 0.5, Number.NaN, '500']) {
    assert.throws(() => move(wallet, { toBank: true, amount }), RangeError, `moved ${amount}`);
  }
});

test('savings earn five per cent a year, paid by the month', () => {
  assert.equal(monthlyInterest(1_240_000), 5_167);
  assert.equal(monthlyInterest(0), 0);
  assert.equal(monthlyInterest(move(openWallet(), { toBank: true, amount: 240_000 }).reserve), 6_167);
});

// ---- Dividends (Exchange) ----

test('collecting pays what is ready into cash, once', () => {
  const before = openWallet();
  const after = collect(before);
  assert.equal(after.cash, before.cash + 800);
  assert.equal(after.ready, 0);
  assert.equal(netWorth(after), netWorth(before) + 800);
  assert.deepEqual({ ...after.ledger[0] }, { title: 'Dividend claimed', amount: 800, from: 'Mogul Exchange' });
  assert.throws(() => collect(after), /Nothing to collect/);
});

// ---- Buying a stake (Exchange, the Marketplace) ----

test('the board has stakes for sale, each with a price, what it pays and what that yields', () => {
  assert.ok(LISTINGS.length >= 3);
  for (const listing of LISTINGS) {
    assert.ok(Number.isInteger(listing.price) && listing.price > 0, listing.name);
    assert.ok(Number.isInteger(listing.monthly) && listing.monthly > 0, listing.name);
    assert.ok(['business', 'property'].includes(listing.kind), listing.name);
    assert.ok(listing.equity > 0 && listing.equity <= 1000, `${listing.name}: equity is in tenths of a per cent`);
  }
  assert.equal(new Set(LISTINGS.map((listing) => listing.id)).size, LISTINGS.length);
});

test('buying a stake pays its price in cash and adds it to the stakes and to what they pay', () => {
  const before = openWallet();
  const listing = LISTINGS[0];
  const after = buyStake(before, listing.id);
  assert.equal(after.cash, before.cash - listing.price);
  assert.equal(after.stakes.length, before.stakes.length + 1);
  assert.equal(after.stakes.at(-1).value, listing.price);
  assert.equal(after.stakes.at(-1).monthly, listing.monthly);
  assert.equal(everything(after), everything(before), 'cash became a stake worth what was paid');
  assert.equal(after.ledger[0].amount, -listing.price);
});

test('a stake can be bought once, and only with enough cash', () => {
  const wallet = openWallet();
  const listing = LISTINGS[0];
  assert.throws(() => buyStake(buyStake(wallet, listing.id), listing.id), /already yours/);
  const poor = move(wallet, { toBank: true, amount: wallet.cash - (listing.price - 1) });
  assert.throws(() => buyStake(poor, listing.id), /Insufficient funds/);
  assert.throws(() => buyStake(wallet, 'no-such-stake'), /No listing/);
});

// ---- Bidding (Exchange, the Auction House) ----

test('a bid must beat the bid that stands by the lot\'s step', () => {
  for (const lot of LOTS) {
    assert.ok(minBid(openWallet(), lot.id) > lot.current, lot.name);
  }
  const lot = LOTS[0];
  const least = minBid(openWallet(), lot.id);
  assert.throws(() => placeBid(openWallet(), lot.id, least - 1), /Bid at least/);
  assert.equal(placeBid(openWallet(), lot.id, least).bids[lot.id], least);
});

test('a bid is held in escrow: it leaves cash, and is not counted in net worth until it comes back', () => {
  const before = openWallet();
  const lot = LOTS[0];
  const bid = minBid(before, lot.id);
  const after = placeBid(before, lot.id, bid);
  assert.equal(after.cash, before.cash - bid);
  assert.equal(after.escrow, bid);
  assert.equal(netWorth(after), netWorth(before) - bid);
  assert.equal(everything(after), everything(before));
});

test('bidding again on a lot lets go of the first bid and holds the new one', () => {
  const before = openWallet();
  const lot = LOTS[0];
  const first = minBid(before, lot.id);
  const once = placeBid(before, lot.id, first);
  const more = minBid(once, lot.id);
  assert.ok(more > first, 'the least bid rises once a bid is placed');
  const twice = placeBid(once, lot.id, more);
  assert.equal(twice.escrow, more);
  assert.equal(twice.cash, before.cash - more);
  assert.equal(everything(twice), everything(before));
});

test('a bid cannot be more than the cash there is', () => {
  const wallet = openWallet();
  assert.throws(() => placeBid(wallet, LOTS[0].id, wallet.cash + 1), /Not enough cash/);
});

// ---- Coins (Exchange, the Trading Floor) ----

test('coins are bought and sold at the price shown, for cash', () => {
  const before = openWallet();
  const bought = buyCoins(before, 3);
  assert.equal(bought.coins, 3);
  assert.equal(bought.cash, before.cash - 3 * COIN.price);
  assert.equal(netWorth(bought), netWorth(before), 'cash became coins worth what was paid');
  const sold = sellCoins(bought, 2);
  assert.equal(sold.coins, 1);
  assert.equal(sold.cash, bought.cash + 2 * COIN.price);
  assert.equal(netWorth(sold), netWorth(before));
});

test('coins that are not held cannot be sold, nor coins bought with cash that is not there', () => {
  const wallet = openWallet();
  assert.throws(() => sellCoins(wallet, 1), /You hold 0/);
  assert.throws(() => buyCoins(wallet, Math.floor(wallet.cash / COIN.price) + 1), /Not enough cash/);
  for (const quantity of [0, -1, 1.5]) assert.throws(() => buyCoins(wallet, quantity), RangeError);
});

// ---- A month's money in and out (Home), and the job it starts with (Jobs) ----

test('a month\'s income is the salary, what the businesses make, the interest and what the stakes pay', () => {
  const wallet = openWallet();
  const { income, expenses, net } = cashFlow(wallet);
  assert.equal(wallet.job.title, 'Software Engineer');
  assert.equal(wallet.job.salary, 7_500); // the game's own figure for the job
  assert.equal(income, 7_500 + 30_900 + 5_167 + 800);
  assert.equal(net, income - expenses);
  assert.equal(signed(compact, net), '+$12.2k');
});

test('money moved into savings earns more interest, so the month\'s income rises with it', () => {
  const before = openWallet();
  const after = move(before, { toBank: true, amount: 240_000 });
  assert.equal(cashFlow(after).income, cashFlow(before).income + 1_000);
});

test('quitting stops the salary; taking a job starts the new one', () => {
  const employed = openWallet();
  const idle = quitJob(employed);
  assert.equal(idle.job, null);
  assert.equal(cashFlow(idle).income, cashFlow(employed).income - 7_500);
  assert.throws(() => quitJob(idle), /no job/);
  const nurse = takeJob(idle, 'Registered Nurse');
  assert.equal(nurse.job.salary, 6_000);
  assert.equal(cashFlow(nurse).income, cashFlow(idle).income + 6_000);
  assert.throws(() => takeJob(nurse, 'Cashier'), /Quit Current Job First/);
});

test('a job that asks for a degree the player has not got cannot be taken', () => {
  const idle = quitJob(openWallet());
  const cto = JOBS.find((job) => job.title === 'CTO');
  assert.equal(cto.needs, 'MBA');
  assert.throws(() => takeJob(idle, 'CTO'), /Not Qualified/);
  assert.throws(() => takeJob(idle, 'Astronaut'), /No job/);
  assert.equal(JOBS.find((job) => job.title === 'IT Support Specialist').salary, 3_500);
});

// ---- The portfolio (Invest) ----

test('the portfolio is the shares, the property and the coins, and it is part of what the Bank calls assets', () => {
  const wallet = openWallet();
  const before = portfolio(wallet);
  assert.equal(before.stocks, POSITIONS.reduce((sum, held) => sum + held.shares * held.price, 0));
  assert.equal(before.total, before.stocks + before.property + before.crypto);
  assert.equal(before.crypto, 0);
  assert.equal(before.positions, POSITIONS.length);
  assert.ok(before.total < position(wallet).assets, 'the businesses are assets too, but not part of the portfolio');
  const after = portfolio(buyCoins(wallet, 2));
  assert.equal(after.crypto, 2 * COIN.price);
  assert.equal(after.positions, POSITIONS.length + 1);
  assert.equal(before.gain, POSITIONS.reduce((sum, held) => sum + held.shares * (held.price - held.cost), 0));
});

// ---- The loan desk's list ----

test('the loans on offer are the game\'s own, with their terms', () => {
  const mortgage = LOANS.find((loan) => loan.name === 'Mortgage');
  assert.deepEqual({ ...mortgage }, { name: 'Mortgage', max: 1_000_000, apr: 65, months: 360, score: 620 });
  assert.equal(LOANS.length, 8);
  assert.ok(LOANS.every((loan) => Number.isInteger(loan.apr)), 'rates are kept in tenths of a per cent');
});
