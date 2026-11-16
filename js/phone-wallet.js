// The wallet behind the three Money Tycoon phones: a small copy of the game's
// money rules, so that the phones on the page can really be used.
//
// All three phones share one wallet. Every amount is a whole number of dollars
// and every change returns a new wallet, leaving the old one as it was. A change
// that cannot be made throws, with the words the phone shows.
//
// The labels and rules follow the game's own source (iosApp/MoneyTycoon). The
// player's figures, and the stakes, lots and coin on offer, are sample data.

const whole = (amount, what) => {
  if (!Number.isInteger(amount)) throw new RangeError(`${what} must be a whole number of dollars, got ${amount}`);
  return amount;
};
const count = (value, what) => {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${what} must be a whole number above zero, got ${value}`);
  return value;
};

// ---- Writing money the way the game does (MoneyFormat.compact) ----

const UNITS = [
  [1_000_000_000_000, 'T'],
  [1_000_000_000, 'bn'],
  [1_000_000, 'm'],
  [1_000, 'k'],
];
const SHORT_FROM = 10_000; // under this the game writes the dollars in full: $9,999, then $10.0k

/** $160,000: every dollar, with a comma at each thousand. */
export function full(amount) {
  const size = Math.abs(whole(amount, 'An amount'));
  return `${amount < 0 ? '-' : ''}$${String(size).replace(/\B(?=(\d{3})+$)/g, ',')}`;
}

/** $25.0k, $1.0m, $1.0bn, $1.0T; under ten thousand, every dollar. */
export function compact(amount) {
  const size = Math.abs(whole(amount, 'An amount'));
  if (size < SHORT_FROM) return full(amount);
  const sign = amount < 0 ? '-' : '';
  let index = UNITS.findIndex(([unit]) => size >= unit); // the largest unit it reaches
  let tenths = Math.floor((size * 10 + UNITS[index][0] / 2) / UNITS[index][0]);
  if (tenths >= 10_000 && index > 0) {
    index -= 1; // a thousand of this unit is one of the next
    tenths = 10;
  }
  return `${sign}$${Math.floor(tenths / 10)}.${tenths % 10}${UNITS[index][1]}`;
}

/** An amount with a plus in front of it when it is a gain. */
export function signed(write, amount) {
  return `${amount > 0 ? '+' : ''}${write(amount)}`;
}

// ---- What there is to buy, bid on and borrow ----

export const APY = 5; // per cent a year, on Reserve Savings

/** Stakes on the Marketplace's board. Equity is in tenths of a per cent. */
export const LISTINGS = Object.freeze(
  [
    { id: 'car-wash', name: 'Northside Car Wash', kind: 'business', seller: 'Ava', equity: 100, price: 95_000, monthly: 640 },
    { id: 'apartments', name: 'Harbor View Apartments', kind: 'property', seller: 'Noor', equity: 50, price: 210_000, monthly: 1_225 },
    { id: 'studio', name: 'Pixel Forge Studio', kind: 'business', seller: 'Leo', equity: 150, price: 380_000, monthly: 2_850 },
  ].map(Object.freeze),
);

/** Lots in the Auction House. `step` is how much a new bid must add to the one that stands. */
export const LOTS = Object.freeze(
  [
    { id: 'diner', name: 'Riverside Diner', kind: 'business', seller: 'Leo', equity: 250, current: 48_500, step: 500, bids: 7, left: '2h left', reserveMet: true, buyNow: 70_000, fair: 66_000, monthly: 410 },
    { id: 'duplex', name: 'Maple Street Duplex', kind: 'property', seller: 'Noor', equity: 100, current: 31_000, step: 500, bids: 3, left: '1d left', reserveMet: false, buyNow: 0, fair: 44_000, monthly: 265 },
  ].map(Object.freeze),
);

/** The one market the Trading Floor's ticket is open on. The game's prices are fictional, and so is this one. */
export const COIN = Object.freeze({ symbol: 'BTC', name: 'Bitcoin', price: 45_000, change: 125, bid: 44_990, ask: 45_010 });

/** The game's loans (Models/LoanProduct.swift). Rates are in tenths of a per cent; `score` is the least credit score. */
export const LOANS = Object.freeze(
  [
    { name: 'Personal Loan', max: 50_000, apr: 120, months: 60, score: 580 },
    { name: 'Auto Loan', max: 100_000, apr: 70, months: 72, score: 600 },
    { name: 'Mortgage', max: 1_000_000, apr: 65, months: 360, score: 620 },
    { name: 'Business Loan', max: 500_000, apr: 90, months: 120, score: 650 },
    { name: 'Student Loan', max: 200_000, apr: 50, months: 240, score: 650 },
    { name: 'Line of Credit', max: 25_000, apr: 150, months: 12, score: 600 },
    { name: 'Emergency Loan', max: 10_000, apr: 200, months: 24, score: 500 },
    { name: 'Payday Loan', max: 1_000, apr: 1500, months: 1, score: 0 },
  ].map(Object.freeze),
);

/** Jobs from the game's catalog (JobCatalog.kt), with what each pays a month. `needs` is a degree the player has not got. */
export const JOBS = Object.freeze(
  [
    { title: 'IT Support Specialist', field: 'Technology', tier: 'Entry Level', salary: 3_500 },
    { title: 'Bank Teller', field: 'Finance', tier: 'Entry Level', salary: 2_800 },
    { title: 'Cashier', field: 'Retail', tier: 'Entry Level', salary: 2_200 },
    { title: 'Registered Nurse', field: 'Healthcare', tier: 'Mid Level', salary: 6_000 },
    { title: 'Software Engineer', field: 'Technology', tier: 'Mid Level', salary: 7_500 },
    { title: 'CTO', field: 'Technology', tier: 'C-Suite', salary: 40_000, needs: 'MBA' },
  ].map(Object.freeze),
);

/** The businesses the player owns outright: sample holdings of two of the game's business types. */
export const BUSINESSES = Object.freeze(
  [
    { name: 'Coffee Shop', icon: 'cup', level: 3, tier: 'Bronze', demand: 68, place: 'Standard', revenue: 9_600, expenses: 6_100, value: 180_000 },
    { name: 'Software Agency', icon: 'laptop', level: 5, tier: 'Silver', demand: 74, place: 'Prime', revenue: 52_000, expenses: 24_600, value: 1_300_000 },
  ].map(Object.freeze),
);

/** Business types from the game's catalog (Business.kt): what each costs to start and takes in a month. */
export const MARKET = Object.freeze(
  [
    { name: 'E-Commerce Store', icon: 'cart', cost: 30_000, revenue: 15_000 },
    { name: 'Coffee Shop', icon: 'cup', cost: 50_000, revenue: 8_000 },
    { name: 'Software Agency', icon: 'laptop', cost: 75_000, revenue: 40_000 },
    { name: 'SaaS Startup', icon: 'cloud', cost: 100_000, revenue: 25_000 },
    { name: 'Fitness Center', icon: 'heart', cost: 200_000, revenue: 30_000 },
    { name: 'Airline', icon: 'plane', cost: 25_000_000, revenue: 1_800_000 },
  ].map(Object.freeze),
);

/** Shares held, at the game's own opening prices (StockMarket.kt). `cost` is what each share was bought for. */
export const POSITIONS = Object.freeze(
  [
    { ticker: 'NVDA', name: 'NVIDIA Corp.', sector: 'Technology', shares: 240, price: 875, cost: 790 },
    { ticker: 'SPY', name: 'S&P 500 ETF', sector: 'Index', shares: 340, price: 500, cost: 468 },
    { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology', shares: 800, price: 175, cost: 162 },
  ].map(Object.freeze),
);

const PROPERTY = 340_000; // property held outside the Exchange
const STOCKS = POSITIONS.reduce((sum, held) => sum + held.shares * held.price, 0);
const BUSINESS_VALUE = BUSINESSES.reduce((sum, business) => sum + business.value, 0);
const BUSINESS_PROFIT = BUSINESSES.reduce((sum, business) => sum + business.revenue - business.expenses, 0);

/** What a month of living costs. */
export const COSTS = Object.freeze({ housing: 12_000, food: 3_200, other: 17_000 });

// ---- The wallet ----

function seal(wallet) {
  wallet.stakes.forEach(Object.freeze);
  wallet.ledger.forEach(Object.freeze);
  Object.freeze(wallet.stakes);
  Object.freeze(wallet.ledger);
  Object.freeze(wallet.bids);
  return Object.freeze(wallet);
}

/** Change a wallet: a copy with `changes` laid over it and, if given, a line added at the top of its ledger. */
function change(wallet, changes, line) {
  return seal({
    ...wallet,
    stakes: [...wallet.stakes],
    bids: { ...wallet.bids },
    ...changes,
    ledger: line ? [line, ...wallet.ledger] : [...wallet.ledger],
  });
}

/** The wallet as the phones open on it: the figures in the game's own store screenshots. */
export function openWallet() {
  return seal({
    cash: 1_960_000, // Everyday Cash
    reserve: 1_240_000, // Reserve Savings
    holdings: BUSINESS_VALUE + STOCKS + PROPERTY, // businesses, shares and property, outside the Exchange
    job: JOBS.find((job) => job.title === 'Software Engineer'),
    owed: 0,
    escrow: 0, // bids held by the Exchange
    ready: 800, // dividends waiting to be collected
    coins: 0,
    stakes: [{ id: 'bakery', name: 'Corner Bakery', kind: 'business', equity: 200, value: 160_000, monthly: 800 }],
    bids: {},
    ledger: [
      { title: 'Interest', amount: 5_167, from: 'Reserve Savings' },
      { title: 'Paycheck', amount: 7_500, from: 'Software Engineer' },
      { title: 'Living costs', amount: -(COSTS.housing + COSTS.food + COSTS.other), from: 'Housing, food and other' },
    ],
  });
}

const stakesWorth = (wallet) => wallet.stakes.reduce((sum, stake) => sum + stake.value, 0);

/** What the Bank's first card shows: cash and savings, everything else owned, and what is owed. */
export function position(wallet) {
  const deposits = wallet.cash + wallet.reserve;
  const assets = wallet.holdings + stakesWorth(wallet) + wallet.coins * COIN.price;
  return { deposits, assets, owed: wallet.owed, total: deposits + assets - wallet.owed };
}

/** Net worth. A bid held in escrow is not counted until it comes back. */
export function netWorth(wallet) {
  return position(wallet).total;
}

/** A month's interest on Reserve Savings. */
export function monthlyInterest(reserve) {
  return Math.round((whole(reserve, 'A balance') * APY) / 1200);
}

/** What the stakes pay in a month. */
export function payouts(wallet) {
  return wallet.stakes.reduce((sum, stake) => sum + stake.monthly, 0);
}

/** A month's money in and out: what Home's cash-flow card shows. */
export function cashFlow(wallet) {
  const income = (wallet.job?.salary ?? 0) + BUSINESS_PROFIT + monthlyInterest(wallet.reserve) + payouts(wallet);
  const expenses = COSTS.housing + COSTS.food + COSTS.other;
  return { income, expenses, net: income - expenses };
}

/** What the Business tab's first card shows. */
export function empire(wallet) {
  const revenue = BUSINESSES.reduce((sum, business) => sum + business.revenue, 0) + payouts(wallet);
  const expenses = BUSINESSES.reduce((sum, business) => sum + business.expenses, 0);
  return { valuation: BUSINESS_VALUE + stakesWorth(wallet), revenue, expenses, net: revenue - expenses };
}

/** What the Invest tab's first card shows: shares, property and coins. Cash, savings and debt belong to the Bank. */
export function portfolio(wallet) {
  const crypto = wallet.coins * COIN.price;
  return {
    stocks: STOCKS,
    property: PROPERTY,
    crypto,
    total: STOCKS + PROPERTY + crypto,
    gain: POSITIONS.reduce((sum, held) => sum + held.shares * (held.price - held.cost), 0),
    positions: POSITIONS.length + (wallet.coins > 0 ? 1 : 0),
  };
}

// ---- Jobs ----

/** Leave the job. */
export function quitJob(wallet) {
  if (!wallet.job) throw new RangeError('There is no job to quit');
  return change(wallet, { job: null });
}

/** Take a job from the board. */
export function takeJob(wallet, title) {
  const job = JOBS.find((entry) => entry.title === title);
  if (!job) throw new RangeError(`No job called ${title}`);
  if (wallet.job) throw new RangeError('Quit Current Job First');
  if (job.needs) throw new RangeError('Not Qualified');
  return change(wallet, { job });
}

// ---- Moving money (Bank, the Move desk) ----

/** The Move desk's quick amounts: 25%, 50%, 75% and all of what is available, rounded down. */
export function moveChips(available) {
  whole(available, 'A balance');
  return [Math.floor(available / 4), Math.floor(available / 2), Math.floor((available * 3) / 4), available];
}

/** Move money between Everyday Cash and Reserve Savings. */
export function move(wallet, { toBank, amount }) {
  count(amount, 'The amount to move');
  const available = toBank ? wallet.cash : wallet.reserve;
  if (amount > available) throw new RangeError('Exceeds available — lower the amount');
  return toBank
    ? change(wallet, { cash: wallet.cash - amount, reserve: wallet.reserve + amount }, { title: 'Transfer to Reserve Savings', amount: -amount, from: 'Everyday Cash' })
    : change(wallet, { cash: wallet.cash + amount, reserve: wallet.reserve - amount }, { title: 'Transfer to Everyday Cash', amount, from: 'Reserve Savings' });
}

// ---- The Exchange ----

/** Collect the dividends that are ready. */
export function collect(wallet) {
  if (wallet.ready <= 0) throw new RangeError('Nothing to collect yet');
  return change(wallet, { cash: wallet.cash + wallet.ready, ready: 0 }, { title: 'Dividend claimed', amount: wallet.ready, from: 'Mogul Exchange' });
}

/** Buy a stake from the Marketplace's board, in cash. */
export function buyStake(wallet, id) {
  const listing = LISTINGS.find((entry) => entry.id === id);
  if (!listing) throw new RangeError(`No listing called ${id}`);
  if (wallet.stakes.some((stake) => stake.id === id)) throw new RangeError('This stake is already yours');
  if (listing.price > wallet.cash) throw new RangeError('Insufficient funds for this transaction.');
  const { name, kind, equity, price, monthly } = listing;
  return change(
    wallet,
    { cash: wallet.cash - price, stakes: [...wallet.stakes, { id, name, kind, equity, value: price, monthly }] },
    { title: 'Purchase settled', amount: -price, from: name },
  );
}

const lotCalled = (id) => {
  const lot = LOTS.find((entry) => entry.id === id);
  if (!lot) throw new RangeError(`No lot called ${id}`);
  return lot;
};

/** The least a new bid on a lot may be. */
export function minBid(wallet, id) {
  const lot = lotCalled(id);
  return Math.max(lot.current, wallet.bids[id] ?? 0) + lot.step;
}

/** Bid on a lot. The bid is held in escrow; an earlier bid on the same lot is let go first. */
export function placeBid(wallet, id, amount) {
  const lot = lotCalled(id);
  count(amount, 'A bid');
  const least = minBid(wallet, id);
  if (amount < least) throw new RangeError(`Bid at least ${full(least)}`);
  const earlier = wallet.bids[id] ?? 0;
  const cash = wallet.cash + earlier;
  if (amount > cash) throw new RangeError('Not enough cash for this bid');
  return change(
    wallet,
    { cash: cash - amount, escrow: wallet.escrow - earlier + amount, bids: { ...wallet.bids, [id]: amount } },
    { title: 'Bid placed', amount: -amount, from: `${lot.name} · held in escrow` },
  );
}

/** Buy coins at the price shown. */
export function buyCoins(wallet, quantity) {
  count(quantity, 'A quantity');
  const total = quantity * COIN.price;
  if (total > wallet.cash) throw new RangeError('Not enough cash for this order');
  return change(wallet, { cash: wallet.cash - total, coins: wallet.coins + quantity }, { title: 'Crypto bought', amount: -total, from: `${quantity} ${COIN.symbol}` });
}

/** Sell coins at the price shown. */
export function sellCoins(wallet, quantity) {
  count(quantity, 'A quantity');
  if (quantity > wallet.coins) throw new RangeError(`You hold ${wallet.coins} ${COIN.symbol}`);
  const total = quantity * COIN.price;
  return change(wallet, { cash: wallet.cash + total, coins: wallet.coins - quantity }, { title: 'Crypto sold', amount: total, from: `${quantity} ${COIN.symbol}` });
}
