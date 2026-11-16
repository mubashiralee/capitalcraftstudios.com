// The Orchestration Hub's floor, drawn: five lanes of jobs moving through
// queue, build, audit and merge. A release stops at the gate until the visitor
// approves it. The numbers are in js/floor.js; this file only puts them on the
// page.

import { GATE, STAGES, createFloor } from './floor.js';
import { reduceMotion, whileVisible } from './motion.js';

const LANES = 5;
const FADES_FROM = 3.45; // where along the floor a merged job starts to fade

const make = (tag, className, text) => {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

/**
 * @param {{ stage: HTMLElement, button: HTMLButtonElement, status: HTMLElement }} parts
 *   `stage` is emptied and drawn into; `button` approves the waiting release;
 *   `status` is told, for screen readers, when a release starts to wait.
 */
export function startHub({ stage, button, status }) {
  const floor = createFloor({ lanes: LANES });

  const head = make('ol', 'hub__stages');
  for (const name of STAGES) head.append(make('li', '', name));
  const board = make('div', 'hub__lanes');
  const lanes = Array.from({ length: LANES }, () => {
    const lane = make('div', 'hub__lane');
    const job = make('div', 'hub__job');
    const kind = make('span', 'hub__kind');
    const model = make('span', 'hub__model');
    for (let pip = 0; pip < 3; pip += 1) model.append(make('i', ''));
    job.append(kind, model);
    lane.append(job);
    board.append(lane);
    return { el: lane, job, kind, model, id: 0 };
  });
  // The gate: a line across the lanes at the door of the merge.
  board.append(make('div', 'hub__gate'));
  stage.replaceChildren(head, board);
  stage.classList.add('is-live');

  let width = 0; // of a lane: the floor from the start of the queue to the end of the merge
  const measure = () => {
    width = lanes[0].el.clientWidth;
  };
  measure();
  new ResizeObserver(() => {
    measure();
    draw();
  }).observe(board);

  let held = 0; // the id of the release the page has said is waiting

  function draw() {
    const jobs = floor.jobs;
    lanes.forEach((lane, index) => {
      const job = jobs.find((candidate) => candidate.lane === index);
      lane.job.hidden = !job;
      if (!job) return;
      if (lane.id !== job.id) {
        lane.id = job.id;
        lane.kind.textContent = job.kind;
        lane.model.dataset.tier = String(job.tier);
        lane.job.classList.toggle('hub__job--release', job.kind === 'Release');
      }
      const stageNow = Math.min(STAGES.length - 1, Math.floor(job.at));
      lane.job.classList.toggle('is-audited', stageNow === 2);
      lane.job.classList.toggle('is-waiting', job.waiting);
      // A release beyond the gate has been approved: nothing else lets one through (js/floor.js).
      lane.job.classList.toggle('is-cleared', job.kind === 'Release' && job.at >= GATE && !job.waiting);
      // A job is placed by its middle (the stylesheet shifts it back by half its own width).
      const x = (job.at / STAGES.length) * width;
      lane.job.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
      lane.job.style.opacity = job.at > FADES_FROM ? String(Math.max(0, 1 - (job.at - FADES_FROM) / (STAGES.length - FADES_FROM))) : '1';
    });

    const waiting = floor.waiting;
    button.setAttribute('aria-disabled', waiting ? 'false' : 'true');
    stage.classList.toggle('is-held', Boolean(waiting));
    if (waiting && waiting.id !== held) {
      held = waiting.id;
      status.textContent = 'A release is waiting at the gate for your approval.';
    }
  }

  function approve() {
    const waiting = floor.waiting;
    if (!waiting || !floor.approve(waiting.id)) return;
    if (reduceMotion.matches) {
      // Nothing is seen to move: the release is merged and the next one is already at the gate.
      settle();
      draw();
      status.textContent = 'Release approved and merged. The next one is waiting at the gate.';
      return;
    }
    status.textContent = 'Release approved. It is merging.';
    draw();
  }

  /** With no motion: move the floor on, unseen, to the next moment a release waits. */
  function settle() {
    for (let frame = 0; frame < 6000 && !floor.waiting; frame += 1) floor.step(1 / 30);
  }

  button.addEventListener('click', approve);
  // The waiting release can be approved by pressing it, too.
  board.addEventListener('click', (event) => {
    if (event.target.closest('.hub__job.is-waiting')) approve();
  });

  if (reduceMotion.matches) settle();
  draw();
  whileVisible(stage, (dt) => {
    if (reduceMotion.matches) return;
    floor.step(dt);
    draw();
  });

  return true;
}
