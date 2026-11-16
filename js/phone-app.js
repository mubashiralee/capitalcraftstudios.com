// The app that runs in the three Money Tycoon phones: what each screen shows,
// and what each press does. Nothing here touches the page (js/phones.js does
// that), so every screen and every press can be checked without a browser.
//
// `openApp()` is the state all three phones share: one wallet, one clock, and
// for each phone where it is in the app. `press()` returns the state after a
// press; `view()` returns a phone's screen as markup. The markup carries no
// inline styles (the site's content policy forbids them): only classes, and
// SVG for anything whose size depends on a number.
//
// Labels and layouts follow the game's own source (iosApp/MoneyTycoon).

import {
  APY,
  BUSINESSES,
  COIN,
  COSTS,
  JOBS,
  LISTINGS,
  LOANS,
  LOTS,
  MARKET,
  POSITIONS,
  buyCoins,
  buyStake,
  cashFlow,
  collect,
  compact,
  empire,
  full,
  minBid,
  monthlyInterest,
  move,
  moveChips,
  netWorth,
  openWallet,
  payouts,
  placeBid,
  portfolio,
  position,
  quitJob,
  sellCoins,
  signed,
  takeJob,
} from './phone-wallet.js';

export const TABS = Object.freeze([
  ['home', 'Home', 'home'],
  ['jobs', 'Jobs', 'briefcase'],
  ['business', 'Business', 'building'],
  ['invest', 'Invest', 'chart'],
  ['bank', 'Bank', 'bank'],
]);
export const DESKS = Object.freeze(['Accounts', 'Cards', 'Loans', 'Move', 'Reserve']);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_SECONDS = 15; // a game day, at the game's slowest speed
const SORTS = ['Name', 'Revenue', 'ROI', 'Price'];

// ---- State ----

const phone = (tab, stack = []) => ({
  tab,
  stacks: { home: [], jobs: [], business: [], invest: [], bank: [], [tab]: stack },
  desk: 'Accounts',
  toBank: true,
  amount: 500,
  range: '3M',
  flow: 'Month to date',
  board: 'Board',
  hall: 'Live',
  bid: 0,
  side: 'Buy',
  quantity: 1,
  span: '7D',
  sort: 'Name',
  alert: null,
  note: '',
});

/** The app as it opens: the three phones on the three screens they were photographed on. */
export function openApp() {
  return {
    wallet: openWallet(),
    clock: { day: 2, month: 0, year: 3, seconds: 14, paused: false },
    phones: [phone('home'), phone('invest', ['exchange']), phone('bank')],
  };
}

/** One second of the game's clock. */
export function tick(app) {
  const { clock } = app;
  if (clock.paused) return app;
  if (clock.seconds > 1) return { ...app, clock: { ...clock, seconds: clock.seconds - 1 } };
  const day = clock.day === 30 ? 1 : clock.day + 1; // a game month is thirty days
  const month = day === 1 ? (clock.month + 1) % 12 : clock.month;
  const year = day === 1 && month === 0 ? clock.year + 1 : clock.year;
  return { ...app, clock: { ...clock, day, month, year, seconds: DAY_SECONDS } };
}

/** The three pieces of Home that change as the clock runs. js/phones.js rewrites these each second. */
export function clockText(clock) {
  return {
    seconds: String(clock.seconds),
    date: `${clock.day} ${MONTHS[clock.month]}`,
    status: clock.paused ? 'Paused' : `Running · Year ${clock.year}`,
  };
}

const top = (nav) => nav.stacks[nav.tab].at(-1) ?? nav.tab;
const push = (nav, screen) => ({ ...nav, stacks: { ...nav.stacks, [nav.tab]: [...nav.stacks[nav.tab], screen] } });
const pop = (nav) => ({ ...nav, stacks: { ...nav.stacks, [nav.tab]: nav.stacks[nav.tab].slice(0, -1) } });
const available = (wallet, nav) => (nav.toBank ? wallet.cash : wallet.reserve);
const into = (nav) => (nav.toBank ? 'Reserve Savings' : 'Everyday Cash');

/** Every press the phones know, by name: (wallet, where the phone is, what was pressed) gives the changes. */
const PRESSES = {
  tab: (wallet, nav, tab) => {
    if (!TABS.some(([key]) => key === tab)) throw new Error(`No tab called ${tab}`);
    // Pressing the tab you are on takes you back to its first screen, as on a phone.
    return { nav: tab === nav.tab ? { ...nav, stacks: { ...nav.stacks, [tab]: [] } } : { ...nav, tab } };
  },
  open: (wallet, nav, screen) => {
    if (!Object.hasOwn(sheets, screen.split(':')[0])) throw new Error(`No screen called ${screen}`);
    return { nav: push(nav, screen) };
  },
  back: (wallet, nav) => ({ nav: pop(nav) }),
  go: (wallet, nav, where) => {
    // From Home: straight to a desk of the Bank, or to the Exchange.
    if (where === 'exchange') return { nav: { ...nav, tab: 'invest', stacks: { ...nav.stacks, invest: ['exchange'] } } };
    return { nav: { ...nav, tab: 'bank', desk: where, stacks: { ...nav.stacks, bank: [] } } };
  },

  // Bank
  desk: (wallet, nav, desk) => {
    if (!DESKS.includes(desk)) throw new Error(`No desk called ${desk}`);
    return { nav: { ...nav, desk } };
  },
  deposit: (wallet, nav) => ({ nav: { ...nav, desk: 'Move', toBank: true } }),
  withdraw: (wallet, nav) => ({ nav: { ...nav, desk: 'Move', toBank: false } }),
  swap: (wallet, nav) => ({ nav: { ...nav, toBank: !nav.toBank } }),
  chip: (wallet, nav, index) => ({ nav: { ...nav, amount: moveChips(available(wallet, nav))[Number(index)] } }),
  nudge: (wallet, nav, by) => ({ nav: { ...nav, amount: Math.max(0, nav.amount + Number(by)) } }),
  review: (wallet, nav) => {
    if (nav.amount <= 0 || nav.amount > available(wallet, nav)) return { nav };
    return { nav: { ...nav, alert: { title: `Move ${full(nav.amount)} to ${into(nav)}?`, message: 'The transfer settles instantly.', yes: 'Transfer', then: 'transfer' } } };
  },
  transfer: (wallet, nav) => ({ wallet: move(wallet, { toBank: nav.toBank, amount: nav.amount }), nav: { ...nav, alert: null } }),

  // Exchange
  collect: (wallet) => ({ wallet: collect(wallet) }),
  board: (wallet, nav, board) => ({ nav: { ...nav, board } }),
  pay: (wallet, nav, id) => ({ wallet: buyStake(wallet, id), nav: { ...pop(nav), board: 'My Portfolio' } }),
  hall: (wallet, nav, hall) => ({ nav: { ...nav, hall } }),
  lot: (wallet, nav, id) => ({ nav: { ...push(nav, `lot:${id}`), bid: minBid(wallet, id) } }),
  raise: (wallet, nav, percent) => {
    const least = minBid(wallet, top(nav).slice(4));
    return { nav: { ...nav, bid: least + Math.floor((least * Number(percent)) / 100) } };
  },
  bid: (wallet, nav) => ({ nav: { ...nav, alert: { title: 'Confirm your bid', message: `${full(nav.bid)} is held in escrow when placed.`, yes: 'Place Bid', then: 'placeBid' } } }),
  placeBid: (wallet, nav) => {
    const id = top(nav).slice(4);
    const after = placeBid(wallet, id, nav.bid);
    return { wallet: after, nav: { ...nav, alert: null, bid: minBid(after, id) } };
  },
  side: (wallet, nav, side) => ({ nav: { ...nav, side } }),
  quantity: (wallet, nav, by) => ({ nav: { ...nav, quantity: Math.max(1, nav.quantity + Number(by)) } }),
  span: (wallet, nav, span) => ({ nav: { ...nav, span } }),
  order: (wallet, nav) => ({ wallet: nav.side === 'Buy' ? buyCoins(wallet, nav.quantity) : sellCoins(wallet, nav.quantity) }),

  // Home, Jobs, Business
  range: (wallet, nav, range) => ({ nav: { ...nav, range } }),
  flow: (wallet, nav, flow) => ({ nav: { ...nav, flow } }),
  sort: (wallet, nav) => ({ nav: { ...nav, sort: SORTS[(SORTS.indexOf(nav.sort) + 1) % SORTS.length] } }),
  quit: (wallet) => ({ wallet: quitJob(wallet) }),
  apply: (wallet, nav, title) => ({ wallet: takeJob(wallet, title) }),
  dismiss: (wallet, nav) => ({ nav: { ...nav, alert: null } }),
};

const ANSWERS = new Set(['transfer', 'placeBid']); // presses that only a question's own button makes

/**
 * The app after phone `index` is pressed. `name` is the press, `arg` what it was
 * on. A press the wallet refuses (not enough cash, say) changes nothing but the
 * note the phone shows, in the wallet's own words (the wallet's refusals are
 * RangeErrors). A press or a screen that does not exist is a mistake in this
 * file, and throws.
 */
export function press(app, index, name, arg) {
  const nav = { ...app.phones[index], note: '' };
  const phones = (next) => app.phones.map((was, at) => (at === index ? next : was));
  if (name === 'pause') return { ...app, clock: { ...app.clock, paused: !app.clock.paused }, phones: phones(nav) };
  // A question is answered before anything else: Cancel, or what it asks about.
  if (nav.alert && name !== 'dismiss' && name !== nav.alert.then) return app;
  if (ANSWERS.has(name) && nav.alert?.then !== name) throw new Error(`"${name}" answers a question that was not asked`);
  const act = PRESSES[name];
  if (!act) throw new Error(`The phones do not know the press "${name}"`);
  try {
    const { wallet = app.wallet, nav: next = nav } = act(app.wallet, nav, arg);
    return { ...app, wallet, phones: phones(next) };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return { ...app, phones: phones({ ...nav, alert: null, note: error.message }) };
  }
}

// ---- Markup ----

const esc = (text) => String(text).replace(/[&<>"]/g, (mark) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[mark]);

// Drawn on a 24 by 24 grid. A leading "s:" marks an icon drawn as a line instead of a filled shape.
const ICONS = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  briefcase: 'M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1h4a2 2 0 0 1 2 2v3H3V8a2 2 0 0 1 2-2zm2 0h2V5h-2zM3 13h7v1.5h4V13h7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  building: 'M5 3h9v18H5zm2 3v2h2V6zm3.5 0v2h2V6zM7 10v2h2v-2zm3.5 0v2h2v-2zM7 14v2h2v-2zm3.5 0v2h2v-2zM15.5 9H19v12h-3.5zm1.1 2.5v1.8h1.3v-1.8zm0 3.5v1.8h1.3V15z',
  chart: 's:M4 4v16h16M7.5 15.5l4-4.5 3 2.5 4.5-6',
  bank: 'M12 3 3 8v2h18V8zM5 11.5h2.5V18H5zm5.75 0h2.5V18h-2.5zm5.75 0H19V18h-2.5zM3 19.5h18V21H3z',
  cart: 'M2.5 4h3l.6 2.2H21l-2 8.3H8.2L5.8 5.6H2.5zM9 17.2a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zm8.5 0a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4z',
  dots: 'M6.5 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm5.5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm5.5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z',
  right: 's:M9 5l7 7-7 7',
  left: 's:M15 5l-7 7 7 7',
  down: 's:M5 9l7 7 7-7',
  banknote: 'M2.5 6.5h19v11h-19zm2 2v7h15v-7zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  card: 'M2.5 6.5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2V9h-19zm0 4.5h19v6.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2zm3 4v1.6h4V15z',
  swap: 's:M8 20V5m0 0L4.5 8.5M8 5l3.5 3.5M16 4v15m0 0l-3.5-3.5M16 19l3.5-3.5',
  into: 'M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zm-1 5v6.1l-2.3-2.3-1.4 1.4 4.7 4.7 4.7-4.7-1.4-1.4-2.3 2.3V7.5z',
  out: 's:M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 16.5v-9m0 0L8.5 11M12 7.5l3.5 3.5',
  diamond: 'M12 3l9 9-9 9-9-9z',
  tray: 'M4 4h16l2 9v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6zm1.6 2-1.3 6h4.2l1 2.5h5l1-2.5h4.200l-1.3-6z',
  doc: 'M6.5 2.5H14l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.500 1.500 0 0 1 5 20V4a1.5 1.5 0 0 1 1.5-1.5zM8 11v1.500h8V11zm0 3.500V16h8v-1.500zM8 18v1.500h5V18z',
  pie: 'M11 3.1A9 9 0 1 0 20.9 13H11zm2-.6V11h8.5A8.5 8.5 0 0 0 13 2.5z',
  store: 'M4 4h16l1.5 5a3 3 0 0 1-1.5 2.600V20H4v-8.400A3 3 0 0 1 2.500 9zm2 9.500V18h5v-4.500zm7.500 0V18H18v-4.500z',
  hammer: 'M13.5 3l6 6-2.200 2.200-1.600-1.600-9.900 9.900a1.600 1.600 0 0 1-2.300-2.300l9.900-9.900-1.600-1.600z',
  history: 's:M4.5 12a7.500 7.500 0 1 0 2.400-5.500M4.500 4.500v3h3M12 8v4.500l3 1.800',
  plus: 'M12 2.500a9.500 9.500 0 1 1 0 19 9.500 9.500 0 0 1 0-19zm-1 5V11H7.500v2H11v3.500h2V13h3.500v-2H13V7.500z',
  person: 'M12 3.500a4.200 4.200 0 1 1 0 8.400 4.200 4.200 0 0 1 0-8.400zM4 20.500c.400-4 3.700-6.500 8-6.500s7.600 2.500 8 6.500z',
  star: 'M12 2.800l2.800 5.800 6.400.900-4.600 4.500 1.100 6.300-5.700-3-5.700 3 1.100-6.300L2.800 9.500l6.400-.900z',
  globe: 's:M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.800 3 2.800 15 0 18M12 3c-2.800 3-2.800 15 0 18',
  gear: 'M12 8.200a3.800 3.800 0 1 1 0 7.600 3.800 3.800 0 0 1 0-7.600zm-1.700-5.700h3.400l.5 2.600 1.900.8 2.200-1.500 2.400 2.400-1.500 2.200.8 1.900 2.500.5v3.400l-2.600.5-.8 1.900 1.500 2.200-2.400 2.400-2.200-1.500-1.900.8-.5 2.500h-3.400l-.5-2.600-1.900-.8-2.200 1.500-2.400-2.400 1.500-2.200-.8-1.900-2.500-.5v-3.400l2.600-.5.8-1.900-1.500-2.200 2.400-2.400 2.200 1.500 1.900-.8z',
  pause: 'M7 5h3.500v14H7zm6.500 0H17v14h-3.500z',
  play: 'M7 4.500l12 7.500-12 7.500z',
  lock: 'M7.500 10V7.500a4.500 4.500 0 0 1 9 0V10H18a1 1 0 0 1 1 1v8.500a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1zm2 0h5V7.500a2.500 2.500 0 0 0-5 0z',
  check: 's:M5 12.500l4.500 4.500L19 7.500',
  rise: 's:M7 17L17 7M9 7h8v8',
  level: 's:M6 12h12',
  exchange: 's:M4 9h14m0 0l-3.500-3.500M18 9l-3.500 3.500M20 15H6m0 0l3.500-3.500M6 15l3.500 3.500',
  cup: 'M4 8h13v1h1.500a2.500 2.500 0 0 1 0 5h-1.900A6.500 6.500 0 0 1 4 12zm13 2.800v1.400h1.500a.700.700 0 0 0 0-1.400zM4 19h13v1.500H4z',
  laptop: 'M5 5h14a1 1 0 0 1 1 1v9H4V6a1 1 0 0 1 1-1zm1 2v6h12V7zM2 16.500h20V18a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z',
  cloud: 'M7 18.500a4.500 4.500 0 0 1-.600-8.960A6 6 0 0 1 18 10.500a4 4 0 0 1-.500 8z',
  heart: 'M12 20.500S3.500 15 3.500 9.200A4.700 4.700 0 0 1 12 6.500a4.700 4.700 0 0 1 8.500 2.700C20.500 15 12 20.500 12 20.500z',
  plane: 'M21 3l-7.500 18-3-7.500L3 10.500z',
  cap: 'M12 4l10 5-10 5L2 9zm-6 8.200V16c0 1.500 2.700 3 6 3s6-1.500 6-3v-3.800l-6 3z',
  clock: 's:M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.500V12l3 2',
  coin: 's:M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM14.500 9.300c-.400-.900-1.300-1.400-2.500-1.400-1.500 0-2.500.800-2.500 2 0 2.900 5.200 1.300 5.200 4.200 0 1.200-1.100 2-2.700 2-1.300 0-2.300-.600-2.700-1.600M12 6.300v1.600m0 8.200v1.600',
};

const icon = (name) => {
  const drawing = ICONS[name];
  if (!drawing) throw new Error(`No icon called ${name}`);
  return drawing.startsWith('s:')
    ? `<svg class="a-icon a-icon--line" viewBox="0 0 24 24" aria-hidden="true"><path d="${drawing.slice(2)}"/></svg>`
    : `<svg class="a-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${drawing}"/></svg>`;
};
const tile = (name, tint = 'gold') => `<span class="a-tile t-${tint}">${icon(name)}</span>`;
const does = (name, arg) => ` type="button" data-do="${name}"${arg === undefined ? '' : ` data-arg="${esc(arg)}"`}`;
const kicker = (text) => `<h3 class="a-kicker">${esc(text)}</h3>`;
// Spans, so that they may stand inside a button as well as a card.
const stat = (label, value, tone = '') => `<span class="a-stat"><span>${esc(label)}</span><b class="${tone}">${esc(value)}</b></span>`;
const stats = (...items) => `<span class="a-stats">${items.join('')}</span>`;
const pill = (text, tone = 'green') => `<span class="a-pill is-${tone}"><i></i>${esc(text)}</span>`;
const tone = (amount) => (amount < 0 ? 'is-loss' : 'is-gain');

/** A line of a list: a tile, a title over a subtitle, and something at the far end. With `press` it is a button. */
function line({ tile: lead = '', title, sub = '', sub2 = '', end = '', chevron = false, press: pressed = null, featured = false }) {
  const inner =
    `${lead}<span class="a-line__text"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}${sub2 ? `<span>${sub2}</span>` : ''}</span>` +
    `${end ? `<span class="a-line__end">${end}</span>` : ''}${chevron ? `<span class="a-chevron">${icon('right')}</span>` : ''}`;
  const kind = `a-line${featured ? ' is-featured' : ''}`;
  return pressed ? `<button class="${kind}"${does(...pressed)}>${inner}</button>` : `<div class="${kind}">${inner}</div>`;
}
const group = (heading, lines) => `<section class="a-group">${heading ? kicker(heading) : ''}<div class="a-list">${lines.join('')}</div></section>`;

/** A row of choices, one of them chosen. `kind` is "chips" (separate pills) or "seg" (one divided bar). */
function choices(kind, name, labels, chosen, args = labels) {
  return `<div class="a-${kind}" role="group">${labels
    .map((label, index) => `<button class="a-choice${label === chosen ? ' is-on' : ''}"${does(name, args[index])} aria-pressed="${label === chosen}">${esc(label)}</button>`)
    .join('')}</div>`;
}
const button = (label, kind, pressed, lead = '') => `<button class="a-btn a-btn--${kind}"${does(...pressed)}>${lead}${esc(label)}</button>`;

/** A line chart 300 wide and `height` tall, with the area under it and a dot on its last point. */
function chart(values, height = 96) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const points = values.map((value, index) => [
    (index * 294) / (values.length - 1) + 3,
    height - 8 - ((value - low) / span) * (height - 20),
  ]);
  const path = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const [endX, endY] = points.at(-1);
  const grid = [0.25, 0.5, 0.75].map((share) => `<path class="a-chart__grid" d="M0 ${(height * share).toFixed(1)}H300"/>`).join('');
  return (
    `<svg class="a-chart" viewBox="0 0 300 ${height}" preserveAspectRatio="none" aria-hidden="true">${grid}` +
    `<path class="a-chart__area" d="${path}L${endX.toFixed(1)} ${height}L3 ${height}Z"/><path class="a-chart__line" d="${path}"/>` +
    `<circle class="a-chart__dot" cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="4"/></svg>`
  );
}

/** A bar 100 long, divided into parts: [share out of 100, colour class]. */
function bar(parts) {
  let at = 0;
  const pieces = parts.map(([share, colour]) => {
    const piece = `<rect class="${colour}" x="${at.toFixed(2)}" y="0" width="${Math.max(0, share - 0.8).toFixed(2)}" height="6" rx="3"/>`;
    at += share;
    return piece;
  });
  return `<svg class="a-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">${pieces.join('')}</svg>`;
}

// ---- The screens. Each returns { title, back, tools, body, foot } ----

const NET_WORTH = {
  '1M': { was: [5_540_000, 5_562_000, 5_588_000, 5_611_000, 5_653_000], from: 'Dec Y2' },
  '3M': { was: [4_480_000, 4_620_000, 4_790_000, 5_010_000, 5_300_000], from: 'Oct Y2' },
  YTD: { was: [5_688_000, 5_694_000], from: 'Jan Y3' },
  All: { was: [10_000, 400_000, 1_200_000, 2_300_000, 3_600_000, 4_700_000], from: 'Jan Y1' },
};

function home(wallet, nav, clock) {
  const worth = netWorth(wallet);
  const flow = cashFlow(wallet);
  const { was, from } = NET_WORTH[nav.range];
  const now = clockText(clock);
  const short = compact(worth);
  const costs = COSTS.housing + COSTS.food + COSTS.other;
  const flowBar = (amount, colour) => bar([[(Math.abs(amount) * 100) / Math.max(flow.income, flow.expenses), colour]]);
  const speeds = ['1x', '2x', '3x', '5x']
    .map((speed, index) => `<span class="a-speed${index ? '' : ' is-on'}">${index ? icon('lock') : ''}${speed}</span>`)
    .join('');
  const desks = [
    line({ tile: tile('bank'), title: 'Mogul Bank', sub: 'Accounts, cards, loans &amp; moving money', chevron: true, press: ['go', 'Accounts'] }),
    line({ tile: tile('exchange'), title: 'Mogul Exchange', sub: 'Marketplace, auctions &amp; the trading floor', chevron: true, press: ['go', 'exchange'] }),
  ];
  if (wallet.ready > 0) {
    desks.push(line({ tile: tile('chart'), title: 'Dividends', sub: `${full(wallet.ready)} ready`, end: button('Claim', 'gold a-btn--small', ['collect']) }));
  }
  return {
    title: '',
    body:
      `<section class="a-card a-card--gold a-mast">` +
      `<div class="a-mast__who"><span class="a-avatar">${icon('person')}</span><p><span class="a-kicker">Welcome back,</span><b>Alex Morgan</b></p>` +
      `<span class="a-disc">${icon('cart')}</span><span class="a-disc">${icon('dots')}</span></div>` +
      `<div class="a-mast__row"><span class="a-level">${icon('star')}Level 12</span><span class="a-quiet">${icon('globe')}EN</span><span class="a-quiet a-quiet--round">${icon('gear')}</span></div></section>` +
      `<section class="a-card a-island"><div class="a-island__now"><span class="a-ring" data-live="seconds">${now.seconds}</span>` +
      `<p><b data-live="date">${now.date}</b><span class="a-status${clock.paused ? ' is-paused' : ''}"><i></i><span data-live="status">${now.status}</span></span></p></div>` +
      `<div class="a-island__row"><div class="a-speeds">${speeds}</div>` +
      `<button class="a-square"${does('pause')} aria-label="${clock.paused ? 'Resume the clock' : 'Pause the clock'}">${icon(clock.paused ? 'play' : 'pause')}</button></div></section>` +
      `<section class="a-card a-card--gold a-worth"><p class="a-kicker">Total net worth</p>` +
      `<p class="a-worth__sum"><span>$</span>${esc(short.slice(1))}</p>` +
      `<p class="a-tags"><span class="a-tag ${tone(flow.net)}">${icon('rise')}${signed(compact, flow.net)}/mo</span><span class="a-tag">${icon('level')}Economy Stable</span></p>` +
      `${choices('seg', 'range', Object.keys(NET_WORTH), nav.range)}${chart([...was, worth])}` +
      `<p class="a-small">${signed(compact, worth - was[0])} this range · ${from} → Jan Y${clock.year}</p></section>` +
      `<section class="a-card"><h3 class="a-head">Monthly Cash Flow</h3><p class="a-small">${nav.flow === 'Expected' ? 'Projected' : 'Month to date'} · month ${clock.month + 1}, year ${clock.year}</p>` +
      `${choices('seg', 'flow', ['Month to date', 'Expected'], nav.flow)}` +
      `<div class="a-flow"><p><span>Income</span><b class="is-gain">${signed(compact, flow.income)}</b></p>${flowBar(flow.income, 'c-green')}` +
      `<p><span>Expenses</span><b class="is-loss">${compact(-flow.expenses)}</b></p>${flowBar(flow.expenses, 'c-red')}</div>` +
      `<p class="a-total"><span>Net Flow</span><b class="${tone(flow.net)}">${signed(compact, flow.net)}</b></p></section>` +
      `<section class="a-group">${kicker('Next')}<div class="a-chips">` +
      `<button class="a-choice"${does('tab', 'invest')}>${icon('chart')}Invest</button><button class="a-choice"${does('tab', 'business')}>${icon('building')}Business</button>` +
      `<button class="a-choice"${does('tab', 'jobs')}>${icon('briefcase')}Jobs</button></div></section>` +
      `<section class="a-group">${kicker('Balances')}<div class="a-pair">` +
      `<div class="a-card a-balance">${tile('banknote', 'green')}<span>Cash</span><b>${compact(wallet.cash)}</b></div>` +
      `<button class="a-card a-balance"${does('go', 'Accounts')}>${tile('bank', 'teal')}<span>Reserve</span><b>${compact(wallet.reserve)}</b></button></div></section>` +
      `<section class="a-card"><p class="a-total"><span class="a-head">Monthly Expenses</span><b class="is-loss">${compact(-costs)}</b></p>` +
      `${bar([[(COSTS.housing * 100) / costs, 'c-gold'], [(COSTS.food * 100) / costs, 'c-gold2'], [(COSTS.other * 100) / costs, 'c-gold3']])}` +
      `<p class="a-legend"><span class="k-gold">Housing</span><span class="k-gold2">Food</span><span class="k-gold3">Other</span></p></section>` +
      group('Mogul desks', desks),
  };
}

function jobs(wallet) {
  const { job } = wallet;
  const current = job
    ? `<section class="a-card a-card--gold"><p class="a-small">Current Position</p><h3 class="a-head">${esc(job.title)}</h3>` +
      `<p class="a-small">Take-home per month</p><p class="a-figure is-gain">${full(job.salary)}</p>` +
      `<p class="a-small">14 mo employed · Performance 72</p>` +
      `<p class="a-small">Overtime is managed by your career loop.</p>${button('Quit', 'red', ['quit'])}</section>`
    : `<section class="a-card a-empty">${tile('briefcase')}<h3 class="a-head">Get a job</h3>` +
      `<p class="a-small">Apply for an entry-level role. Better jobs unlock as you finish education.</p></section>`;
  const fields = { Technology: 'laptop', Finance: 'banknote', Healthcare: 'plus', Retail: 'cart' };
  const board = job
    ? ''
    : `<section class="a-group"><h3 class="a-head">Available Positions</h3><div class="a-list">${JOBS.map((offer) =>
        line({
          tile: tile(fields[offer.field], 'green'),
          title: esc(offer.title),
          sub: `<em>${esc(offer.tier)}</em> • ${esc(offer.field)}`,
          sub2: offer.needs ? `<span class="is-loss">Requires: ${esc(offer.needs)}</span>` : '',
          end: `<b class="is-gain">${full(offer.salary)}</b><span>/month</span>`,
          chevron: true,
          press: ['apply', offer.title],
        }),
      ).join('')}</div></section>`;
  return {
    title: 'Jobs',
    body:
      current +
      board +
      group('', [
        line({ tile: tile('briefcase'), title: 'Career Hub', sub: 'Manage your week, skills, and promotions.' }),
        line({ tile: tile('cap', 'teal'), title: 'Education', sub: 'Bachelor’s Degree', sub2: 'No active program' }),
      ]),
  };
}

function business(wallet, nav) {
  const all = empire(wallet);
  const by = {
    Name: (a, b) => a.name.localeCompare(b.name),
    Revenue: (a, b) => b.revenue - a.revenue,
    ROI: (a, b) => (b.revenue - b.expenses) / b.value - (a.revenue - a.expenses) / a.value,
    Price: (a, b) => b.value - a.value,
  }[nav.sort];
  const owned = [...BUSINESSES].sort(by).map((firm) => {
    const profit = firm.revenue - firm.expenses;
    return (
      `<article class="a-card a-firm"><div class="a-firm__top">${tile(firm.icon)}<p><b>${esc(firm.name)}</b><span>Level ${firm.level}</span>` +
      `<span>Demand ${firm.demand} · ${esc(firm.place)}</span></p><span class="a-badge">${esc(firm.tier)}</span></div>` +
      stats(stat('Revenue', compact(firm.revenue), 'is-gain'), stat('Expenses', compact(firm.expenses), 'is-loss'), stat('Profit', signed(compact, profit), tone(profit))) +
      `</article>`
    );
  });
  const staked = wallet.stakes.map(
    (stake) =>
      `<article class="a-card a-firm"><div class="a-firm__top">${tile(stake.kind === 'property' ? 'home' : 'building')}<p><b>${esc(stake.name)}</b>` +
      `<span>${stake.equity / 10}% owned</span><span>Pays ${full(stake.monthly)}/mo</span></p><span class="a-badge">Stake</span></div></article>`,
  );
  return {
    title: 'Business',
    body:
      `<section class="a-card a-card--gold"><span class="a-badge">Empire</span><p class="a-kicker k-gold">This month’s net</p>` +
      `<p class="a-figure ${tone(all.net)}">${signed(compact, all.net)}</p>` +
      stats(stat('Valuation', compact(all.valuation)), stat('Revenue', signed(compact, all.revenue)), stat('Expenses', compact(all.expenses))) +
      `</section>` +
      `<section class="a-group"><div class="a-split"><h3 class="a-head">Holdings</h3><button class="a-text"${does('sort')}>${icon('swap')}${nav.sort}</button></div>${owned.join('')}${staked.join('')}</section>` +
      group('', [line({ tile: tile('plus'), title: 'Acquire a business', sub: 'Browse the catalog and acquire a new holding', chevron: true, press: ['open', 'catalog'], featured: true })]),
  };
}

function catalog() {
  return {
    title: 'Business market',
    back: 'Close',
    body: group(
      '',
      MARKET.map((type) => line({ tile: tile(type.icon), title: esc(type.name), sub: `${signed(compact, type.revenue)}/mo revenue`, end: `<b>${compact(type.cost)}</b>` })),
    ),
  };
}

function invest(wallet) {
  const held = portfolio(wallet);
  const share = (part) => (part * 100) / held.total;
  const rows = POSITIONS.map((owned) => {
    const gain = owned.shares * (owned.price - owned.cost);
    return line({
      tile: tile(owned.sector === 'Technology' ? 'laptop' : 'chart'),
      title: owned.ticker,
      sub: `${owned.shares} shares · Avg. cost ${full(owned.cost)}`,
      end: `<b>${compact(owned.shares * owned.price)}</b><span class="${tone(gain)}">${signed(compact, gain)}</span>`,
    });
  });
  if (wallet.coins > 0) {
    rows.push(line({ tile: tile('coin', 'teal'), title: COIN.symbol, sub: `${wallet.coins}`, end: `<b>${compact(held.crypto)}</b>` }));
  }
  return {
    title: 'Invest',
    body:
      `<section class="a-card a-card--gold"><p class="a-kicker">Portfolio</p><p class="a-figure">${compact(held.total)}</p>` +
      `<p class="a-tags"><span class="a-tag is-gain">▲ ${compact(held.gain)} · +${((held.gain * 100) / (held.stocks - held.gain)).toFixed(1)}%</span><span class="a-small">unrealized</span></p>` +
      `${bar([[share(held.stocks), 'c-gold'], [share(held.crypto), 'c-teal'], [share(held.property), 'c-grey']])}` +
      `<p class="a-legend"><span class="k-gold">Stocks</span><span class="k-teal">Crypto</span><span class="k-grey">Property</span></p>` +
      stats(stat('Passive income', `${signed(compact, payouts(wallet))}/mo`, 'is-gain'), stat('Positions', String(held.positions))) +
      `</section>` +
      group('Desks', [
        line({
          tile: tile('store'),
          title: `Mogul Exchange ${pill('Live')}`,
          sub: 'Trade business &amp; property stakes with other tycoons',
          chevron: true,
          press: ['open', 'exchange'],
          featured: true,
        }),
      ]) +
      group('Positions', rows),
  };
}

function bank(wallet, nav) {
  const { deposits, assets, owed, total } = position(wallet);
  const interest = `${APY}.0% APY · ${full(monthlyInterest(wallet.reserve))}/mo`;
  const records =
    `<section class="a-group">${kicker('Statements & Records')}<div class="a-pair">` +
    `<button class="a-card a-record"${does('open', 'transactions')}>${tile('doc')}<b>Transactions</b><span>Every credit and debit, day by day</span><em>Open</em></button>` +
    `<button class="a-card a-record"${does('open', 'expenses')}>${tile('pie', 'green')}<b>Expenses</b><span>Where your money goes, month by month</span><em>Open</em></button></div></section>`;
  const panes = {
    Accounts: () =>
      group('Holdings', [
        line({ tile: tile('banknote', 'green'), title: 'Everyday Cash', sub: 'Instant · no fees', end: `<b>${compact(wallet.cash)}</b>` }),
        line({ tile: tile('bank'), title: 'Reserve Savings', sub: interest, end: `<b>${compact(wallet.reserve)}</b>` }),
      ]) + `<div class="a-pair">${button('Deposit', 'gold', ['deposit'], icon('into'))}${button('Withdraw', 'line', ['withdraw'], icon('out'))}</div>`,
    Cards: () => group('Cards · 0', [line({ tile: tile('card'), title: 'Apply for your first card', chevron: true, press: ['open', 'cards'] })]),
    Loans: () =>
      group(
        'Pre-qualified · Score checked',
        LOANS.filter((loan) => ['Mortgage', 'Business Loan'].includes(loan.name)).map((loan) =>
          line({ tile: tile(loan.name === 'Mortgage' ? 'home' : 'building'), title: loan.name, sub: loanTerms(loan), chevron: true, press: ['open', 'loans'] }),
        ),
      ) + group('Active · 0', [line({ tile: tile('plus', 'grey'), title: 'No facilities — view offers', chevron: true, press: ['open', 'loans'] })]),
    Move: () => {
      const here = available(wallet, nav);
      const quick = moveChips(here);
      const fits = nav.amount > 0 && nav.amount <= here;
      const [fromName, fromIcon, toName, toNote] = nav.toBank
        ? ['Everyday Cash', 'banknote', 'Reserve Savings', 'Earns interest']
        : ['Reserve Savings', 'bank', 'Everyday Cash', 'Instant'];
      return (
        group('Transfer', [
          line({ tile: tile(fromIcon, 'grey'), title: fromName, sub: compact(here), end: `<button class="a-round"${does('swap')} aria-label="Swap direction">${icon('swap')}</button>` }),
          line({ tile: tile(nav.toBank ? 'bank' : 'banknote', 'grey'), title: toName, sub: toNote }),
        ]) +
        `<div class="a-chips" role="group">${['25%', '50%', '75%', 'Max']
          .map((label, index) => `<button class="a-choice${quick[index] === nav.amount && nav.amount > 0 ? ' is-on' : ''}"${does('chip', index)}${here > 0 ? '' : ' disabled'}>${label}</button>`)
          .join('')}</div>` +
        `<div class="a-card a-amount"><b>${full(nav.amount)}</b><span class="a-stepper"><button${does('nudge', -100)} aria-label="Less">−</button><button${does('nudge', 100)} aria-label="More">+</button></span></div>` +
        (fits || nav.amount === 0
          ? `<p class="a-small">Within ${compact(here)} available · settles instantly</p>`
          : `<p class="a-small is-warn">Exceeds available — lower the amount</p>`) +
        `<button class="a-btn a-btn--${fits ? 'gold' : 'off'} a-btn--wide"${does('review')}${fits ? '' : ' disabled'}>Review transfer</button>`
      );
    },
    Reserve: () =>
      group('Retirement Accounts', [
        line({ tile: tile('tray'), title: 'Total balance', end: `<b>${compact(0)}</b>` }),
        line({ tile: tile('right', 'grey'), title: 'Manage your accounts', chevron: true, press: ['open', 'retirement'] }),
      ]),
  };
  return {
    title: 'Mogul Bank',
    rail: choices('rail', 'desk', DESKS, nav.desk),
    body:
      `<p class="a-member">${tile('diamond')}<span class="a-kicker">Private bank · Member</span></p>` +
      `<section class="a-card a-card--gold"><p class="a-kicker">Total position</p><p class="a-figure">${compact(total)}</p>` +
      `<p class="a-apy is-gain">${interest} interest</p>` +
      stats(stat('Cash + savings', compact(deposits)), stat('Assets', compact(assets)), stat('Owed', compact(owed))) +
      `</section><div class="a-pane">${panes[nav.desk]()}</div>${records}`,
  };
}

const loanTerms = (loan) => `Up to ${compact(loan.max)} · ${(loan.apr / 10).toFixed(1)}% APR · ${loan.months} mo`;

const sheets = {
  cards: () => ({
    title: 'Credit Cards',
    back: 'Close',
    body:
      `<section class="a-card a-empty">${tile('card')}<h3 class="a-head">No cards yet</h3><p class="a-small">Tap a tier below to apply for your first card.</p></section>` +
      group('Apply for a New Card', ['Basic', 'Gold', 'Platinum', 'Black'].map((tier) => line({ tile: tile('card', tier === 'Basic' ? 'grey' : 'gold'), title: tier }))),
  }),
  loans: () => ({
    title: 'Loans & Debt',
    back: 'Close',
    body:
      `<section class="a-card a-empty">${tile('check', 'green')}<h3 class="a-head">Debt Free!</h3><p class="a-small">You have no outstanding loans. Great financial health!</p></section>` +
      group('8 loan types available', LOANS.map((loan) => line({ tile: tile('banknote'), title: loan.name, sub: loanTerms(loan) }))),
  }),
  retirement: () => ({
    title: 'Retirement Accounts',
    back: 'Back',
    body:
      `<p class="a-small">Contribute to tax-advantaged accounts</p>` +
      group('', ['401(k)', 'Traditional IRA', 'Roth IRA', 'HSA'].map((name) => line({ tile: tile('tray'), title: name, sub: `${full(0)} balance` }))),
  }),
  transactions: (wallet) => ({
    title: 'Transactions',
    back: 'Close',
    body: group(
      '',
      wallet.ledger.map((entry) =>
        line({ title: esc(entry.title), sub: esc(entry.from), end: `<b class="${tone(entry.amount)}">${signed(full, entry.amount)}</b>` }),
      ),
    ),
  }),
  expenses: () => {
    const costs = COSTS.housing + COSTS.food + COSTS.other;
    return {
      title: 'Expenses',
      back: 'Close',
      body:
        `<section class="a-card"><p class="a-kicker">Monthly Expenses</p><p class="a-figure is-loss">${compact(-costs)}</p>` +
        `${bar([[(COSTS.housing * 100) / costs, 'c-gold'], [(COSTS.food * 100) / costs, 'c-gold2'], [(COSTS.other * 100) / costs, 'c-gold3']])}</section>` +
        group('', [
          line({ tile: tile('home'), title: 'Housing', end: `<b>${compact(COSTS.housing)}</b>` }),
          line({ tile: tile('cup'), title: 'Food', end: `<b>${compact(COSTS.food)}</b>` }),
          line({ tile: tile('dots', 'grey'), title: 'Other', end: `<b>${compact(COSTS.other)}</b>` }),
        ]),
    };
  },
  catalog,

  exchange: (wallet) => {
    const worth = wallet.stakes.reduce((sum, stake) => sum + stake.value, 0);
    const venues = [
      line({ tile: tile('store'), title: 'Marketplace', sub: 'Buy &amp; sell fixed-price equity stakes', chevron: true, press: ['open', 'market'] }),
      line({ tile: tile('hammer'), title: 'Auction House', sub: 'Bid on timed lots, or auction your own stakes', chevron: true, press: ['open', 'auction'] }),
      line({ tile: tile('chart', 'green'), title: 'Trading Floor', sub: 'Live crypto order book — limit &amp; market orders', chevron: true, press: ['open', 'floor'] }),
    ];
    if (wallet.ready === 0) {
      venues.push(line({ tile: tile('coin'), title: 'Collect Dividends', sub: 'Claim accrued payouts from your passive stakes' }));
    }
    return {
      title: 'Mogul Exchange',
      back: 'Back',
      tools: `<button class="a-tool"${does('open', 'activity')} aria-label="Activity">${icon('history')}</button>`,
      body:
        `<p>${pill('Live')}</p><section class="a-card a-card--gold"><p class="a-kicker">Your stakes</p>` +
        `<p class="a-figure">${worth >= 1_000_000 ? compact(worth) : full(worth)}</p>` +
        stats(stat('Monthly payouts', `${signed(full, payouts(wallet))}/mo`, 'is-gain'), stat('Stakes', String(wallet.stakes.length))) +
        (wallet.ready > 0 ? `<p class="a-total a-total--rule"><b>${full(wallet.ready)} ready</b>${button('Collect', 'gold', ['collect'])}</p>` : '') +
        `</section>${group('Venues', venues)}`,
    };
  },
  activity: (wallet) => {
    const seen = wallet.ledger.filter((entry) => ['Dividend claimed', 'Purchase settled', 'Bid placed', 'Crypto bought', 'Crypto sold'].includes(entry.title));
    return {
      title: 'Activity',
      back: 'Done',
      body: seen.length
        ? group('', seen.map((entry) => line({ tile: tile('history'), title: esc(entry.title), sub: esc(entry.from), end: `<b class="${tone(entry.amount)}">${signed(full, entry.amount)}</b>` })))
        : `<section class="a-card a-empty">${tile('history')}<h3 class="a-head">No activity yet</h3>` +
          `<p class="a-small">Your Mogul Exchange sales, dividends, and auction results will appear here.</p></section>`,
    };
  },
  market: (wallet, nav) => {
    const mine = (stake) =>
      line({ tile: tile(stake.kind === 'property' ? 'home' : 'building'), title: esc(stake.name), sub: `${stake.equity / 10}% Equity Stake`, end: `<b>${compact(stake.value)}</b><span class="is-gain">${signed(full, stake.monthly)}/mo</span>` });
    const forSale = LISTINGS.filter((listing) => !wallet.stakes.some((stake) => stake.id === listing.id));
    const boards = {
      Board: () =>
        forSale
          .map(
            (listing) =>
              `<button class="a-card a-listing"${does('open', `buy:${listing.id}`)}><span class="a-firm__top">${tile(listing.kind === 'property' ? 'home' : 'building')}` +
              `<span class="a-line__text"><b>${esc(listing.name)}</b><span>${listing.kind === 'property' ? 'Real Estate' : 'Business'} Stake · ${esc(listing.seller)}</span></span></span>` +
              stats(stat('Equity', `${(listing.equity / 10).toFixed(1)}%`), stat('Price', compact(listing.price)), stat('Monthly', `${full(listing.monthly)}/mo`, 'is-gain'), stat('Yield', `${((listing.monthly * 1200) / listing.price).toFixed(1)}%`)) +
              `</button>`,
          )
          .join(''),
      'My Portfolio': () => group('', wallet.stakes.map(mine)),
      Dividends: () =>
        wallet.ready > 0
          ? `<section class="a-card"><p class="a-total"><b>${full(wallet.ready)} ready</b>${button('Collect', 'gold', ['collect'])}</p></section>`
          : `<section class="a-card a-empty">${tile('coin')}<h3 class="a-head">Nothing to collect yet</h3></section>`,
      'List My Stakes': () => group('', wallet.stakes.map(mine)),
    };
    return {
      title: 'Marketplace',
      back: 'Back',
      body: `<p>${pill(`Online · ${forSale.length} listings`, forSale.length ? 'green' : 'amber')}</p>${choices('rail', 'board', Object.keys(boards), nav.board)}<div class="a-pane">${boards[nav.board]()}</div>`,
    };
  },
  buy: (wallet, nav, id) => {
    const listing = LISTINGS.find((entry) => entry.id === id);
    const short = listing.price > wallet.cash;
    return {
      title: 'Confirm Purchase',
      back: 'Cancel',
      body:
        `<section class="a-card a-card--gold"><h3 class="a-head">${esc(listing.name)}</h3><p class="a-small">${(listing.equity / 10).toFixed(1)}% Equity Stake</p><p class="a-small">Seller: ${esc(listing.seller)}</p></section>` +
        group('Payment Method', [line({ tile: tile('banknote', 'green'), title: 'Cash', sub: `${compact(wallet.cash)} available` })]) +
        group('', [
          line({ title: 'Listing Price', end: `<b>${full(listing.price)}</b>` }),
          line({ title: 'Est. Monthly Income', end: `<b class="is-gain">${full(listing.monthly)}/mo</b>` }),
          line({ title: 'Yield', end: `<b>${((listing.monthly * 1200) / listing.price).toFixed(1)}%</b>` }),
          line({ title: 'Total Due', end: `<b>${full(listing.price)}</b>` }),
        ]) +
        (short ? `<p class="a-small is-warn">Insufficient funds for this transaction.</p>` : '') +
        `<button class="a-btn a-btn--${short ? 'off' : 'green'} a-btn--wide"${does('pay', id)}${short ? ' disabled' : ''}>Confirm &amp; Pay</button>`,
    };
  },
  auction: (wallet, nav) => {
    const lots = LOTS.map((lot) => {
      const mine = wallet.bids[lot.id];
      return (
        `<button class="a-card a-listing"${does('lot', lot.id)}><span class="a-split"><b>${esc(lot.name)}</b><span class="a-small">${lot.left}</span></span>` +
        `<span class="a-tags"><span class="a-tag">${lot.equity / 10}% stake</span><span class="a-tag">${lot.bids + (mine ? 1 : 0)} bids</span>` +
        `${lot.reserveMet ? '<span class="a-tag is-gain">Reserve met</span>' : ''}<span class="a-tag">${esc(lot.seller)}</span></span>` +
        `<span class="a-split"><span class="a-stat"><span>Current</span><b>${full(mine ?? lot.current)}</b></span>${lot.buyNow ? `<span class="a-stat"><span>Buy now</span><b>${compact(lot.buyNow)}</b></span>` : ''}</span></button>`
      );
    });
    const bids = Object.entries(wallet.bids).map(([id, amount]) => {
      const lot = LOTS.find((entry) => entry.id === id);
      return line({ tile: tile('hammer'), title: esc(lot.name), sub: `${lot.equity / 10}% stake · your bid`, end: `<b>${full(amount)}</b><span class="is-gain">Winning</span>` });
    });
    const empty = (name, words) => `<section class="a-card a-empty">${tile(name)}<h3 class="a-head">${words}</h3></section>`;
    const halls = {
      Live: () => lots.join(''),
      'My Bids': () => (bids.length ? group('', bids) : empty('hammer', 'You haven’t bid on anything yet')),
      'My Listings': () => empty('store', 'You have no active lots'),
      Sell: () =>
        group('', wallet.stakes.map((stake) => line({ tile: tile(stake.kind === 'property' ? 'home' : 'building'), title: esc(stake.name), sub: `${stake.equity / 10}% owned`, end: `<b>${compact(stake.value)}</b>` }))),
    };
    return {
      title: 'Auction House',
      back: 'Back',
      body:
        (wallet.escrow > 0 ? `<p class="a-banner">${icon('lock')}<span><b>${full(wallet.escrow)} held in Exchange escrow</b>Released if outbid. Not counted in net worth until released.</span></p>` : '') +
        `${choices('seg', 'hall', Object.keys(halls), nav.hall)}<div class="a-pane">${halls[nav.hall]()}</div>`,
    };
  },
  lot: (wallet, nav, id) => {
    const lot = LOTS.find((entry) => entry.id === id);
    const mine = wallet.bids[id];
    const least = minBid(wallet, id);
    return {
      title: lot.name,
      back: 'Close',
      body:
        `<p class="a-tags">${pill(lot.left)}${mine ? '<span class="a-tag is-gain">You’re winning</span>' : ''}</p>` +
        group('', [
          line({ title: 'Equity', end: `<b>${lot.equity / 10}% stake</b>` }),
          line({ title: 'Fair value', end: `<b class="k-gold">${full(lot.fair)}</b>` }),
          line({ title: 'Monthly income', end: `<b class="is-gain">${full(lot.monthly)}/mo</b>` }),
          line({ title: 'Current bid', sub: `${lot.bids + (mine ? 1 : 0)} bids`, end: `<b class="k-gold">${full(mine ?? lot.current)}</b>` }),
        ]) +
        `<section class="a-group">${kicker('Quick bid')}${choices('chips', 'raise', ['Min', '+5%', '+10%'], nav.bid === least ? 'Min' : '', [0, 5, 10])}` +
        `<div class="a-card a-amount"><b>${full(nav.bid)}</b></div><p class="a-small">Bid at least ${full(least)}</p>` +
        `<button class="a-btn a-btn--gold a-btn--wide"${does('bid')}>Place Bid</button>` +
        `<p class="a-small">Your bid is held in escrow when placed. If you are outbid, it is released back to you automatically.</p></section>`,
    };
  },
  floor: (wallet, nav) => {
    const tape = { '1H': [44_900, 44_960, 44_930, 44_980, 45_000], '6H': [44_600, 44_820, 44_700, 44_910, 45_000], '1D': [44_440, 44_300, 44_700, 44_650, 45_000], '7D': [42_900, 43_600, 43_200, 44_100, 43_900, 44_700, 45_000] };
    const total = nav.quantity * COIN.price;
    return {
      title: 'Trading Floor',
      back: 'Back',
      foot: `<p class="a-disclaimer">Simulated market — fictional in-game prices, in-game cash only. Not real cryptocurrency, not financial advice.</p>`,
      body:
        `<section class="a-card a-card--gold"><div class="a-split"><p><b class="a-head">${COIN.symbol}</b> <span class="a-small">${COIN.name}</span></p>` +
        `<p class="a-quote"><b>${full(COIN.price)}</b><span class="is-gain">▲ +${(COIN.change / 100).toFixed(2)}%</span></p></div>` +
        stats(stat('Bid', full(COIN.bid)), stat('Ask', full(COIN.ask)), stat('24h Vol', '--')) +
        `</section><section class="a-card">${choices('seg', 'span', Object.keys(tape), nav.span)}${chart(tape[nav.span], 80)}</section>` +
        `<section class="a-card"><h3 class="a-head">Place order</h3>${choices('seg', 'side', ['Buy', 'Sell'], nav.side)}` +
        `<p class="a-total"><span>Your position</span><b>${wallet.coins} ${COIN.symbol}</b></p>` +
        `<div class="a-amount"><span>Quantity</span><b>${nav.quantity}</b><span class="a-stepper"><button${does('quantity', -1)} aria-label="Less">−</button><button${does('quantity', 1)} aria-label="More">+</button></span></div>` +
        `<p class="a-total"><span>Total</span><b class="k-gold">${full(total)}</b></p>` +
        `<button class="a-btn a-btn--gold a-btn--wide"${does('order')}>Place ${nav.side.toLowerCase()} order</button></section>`,
    };
  },
};

const ROOTS = { home, jobs, business, invest, bank };

/** The screen phone `index` is on. */
export function screenOf(app, index) {
  const nav = app.phones[index];
  const [name, arg] = top(nav).split(':');
  const draw = nav.stacks[nav.tab].length ? sheets[name] : ROOTS[name];
  if (!draw) throw new Error(`No screen called ${name}`);
  return { name, ...draw(app.wallet, nav, nav.stacks[nav.tab].length ? arg : app.clock) };
}

/** Phone `index`, as markup: its bar, its screen, its tabs, and a question or a note if one is up. */
export function view(app, index) {
  const nav = app.phones[index];
  const screen = screenOf(app, index);
  const lead = screen.back
    ? `<button class="a-back"${does('back')} aria-label="${screen.back}">${['Back'].includes(screen.back) ? icon('left') : esc(screen.back)}</button>`
    : '';
  const bar =
    screen.title === ''
      ? ''
      : `<header class="a-bar-top${screen.back ? ' is-pushed' : ''}">${lead}<h2>${esc(screen.title)}</h2>` +
        `<span class="a-tools">${screen.tools ?? (screen.back ? '' : `<span class="a-tool">${icon('cart')}</span><span class="a-tool">${icon('dots')}</span>`)}</span></header>`;
  const tabs = TABS.map(
    ([key, label, drawing]) => `<button class="a-tab${key === nav.tab ? ' is-on' : ''}"${does('tab', key)} aria-pressed="${key === nav.tab}">${icon(drawing)}<span>${label}</span></button>`,
  ).join('');
  const alert = nav.alert
    ? `<div class="a-ask" role="alertdialog" aria-label="${esc(nav.alert.title)}"><div class="a-ask__box"><b>${esc(nav.alert.title)}</b><p>${esc(nav.alert.message)}</p>` +
      `<div class="a-ask__row"><button${does('dismiss')}>Cancel</button><button class="is-yes"${does(nav.alert.then)}>${esc(nav.alert.yes)}</button></div></div></div>`
    : '';
  // While a question is up, the screen under it cannot be pressed or tabbed to.
  return (
    `<div class="a-view" data-screen="${esc(top(nav))}"><div class="a-page"${nav.alert ? ' inert' : ''}>${bar}${screen.rail ?? ''}` +
    `<div class="a-scroll" data-scroll>${screen.body}</div>${screen.foot ?? ''}${nav.note ? `<p class="a-note" role="status">${esc(nav.note)}</p>` : ''}` +
    `<nav class="a-tabs" aria-label="Money Tycoon">${tabs}</nav></div>${alert}</div>`
  );
}
