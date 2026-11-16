// The Orchestration Hub's floor as numbers: jobs moving through queue, build,
// audit and merge, one to a lane. Nothing here touches the page, so the same
// code runs in the browser (js/hub.js draws it) and in Node
// (tests/floor.test.mjs).
//
// It is a picture of how the Hub works, not a feed from it: the jobs are made
// up. The rule it shows is real. A release stops at the gate before the merge
// and stays there until a person approves it.

export const STAGES = Object.freeze(['Queue', 'Build', 'Audit', 'Merge']);

/** Where along the floor a release waits: the door of the merge. */
export const GATE = 3;

// What each kind of job is given: a model to match it (1 small, 3 large), and seconds to build.
const KINDS = Object.freeze([
  { kind: 'Feature', tier: 3, build: 4.4 },
  { kind: 'Fix', tier: 2, build: 2.8 },
  { kind: 'Tests', tier: 2, build: 2.3 },
  { kind: 'Docs', tier: 1, build: 1.6 },
]);
const RELEASE = Object.freeze({ kind: 'Release', tier: 3, build: 3.2 });

const SECONDS = Object.freeze({ queue: 0.9, audit: 1.6, merge: 0.8, empty: 0.7 }); // in each stage, and a lane stands empty between jobs
const RELEASE_AFTER = 4; // other jobs launched between one release and the next

/**
 * @param {{ lanes?: number, random?: () => number }} [floor]
 *   `random` gives numbers from 0 up to (not including) 1.
 */
export function createFloor({ lanes = 5, random = Math.random } = {}) {
  const jobs = new Array(lanes).fill(null);
  const empty = new Float64Array(lanes); // seconds each empty lane still has to stand
  let nextId = 1;
  let sinceRelease = RELEASE_AFTER - Math.min(lanes - 1, 2); // so that the first release starts in a middle lane
  let merged = 0;

  const releaseOnFloor = () => jobs.some((job) => job?.kind === 'Release');

  function launch(lane, at = 0) {
    const due = sinceRelease >= RELEASE_AFTER && !releaseOnFloor();
    const made = due ? RELEASE : KINDS[Math.floor(random() * KINDS.length)];
    sinceRelease = due ? 0 : sinceRelease + 1;
    jobs[lane] = {
      id: nextId,
      lane,
      kind: made.kind,
      tier: made.tier,
      // Seconds in each stage: no two jobs go at quite the same pace.
      takes: [SECONDS.queue, made.build, SECONDS.audit, SECONDS.merge].map((seconds) => seconds * (0.8 + 0.4 * random())),
      at,
      waiting: false,
    };
    nextId += 1;
  }

  // The floor is busy when it is first seen, and one lane already carries a release.
  for (let lane = 0; lane < lanes; lane += 1) launch(lane, random() * 1.6);

  return {
    /** Move every job on by `seconds`. */
    step(seconds) {
      for (let lane = 0; lane < lanes; lane += 1) {
        const job = jobs[lane];
        if (!job) {
          empty[lane] -= seconds;
          if (empty[lane] <= 0) launch(lane);
          continue;
        }
        if (job.waiting) continue;
        const stage = Math.min(STAGES.length - 1, Math.floor(job.at));
        const next = job.at + seconds / job.takes[stage];
        // A release that reaches the gate stops on it. Once approved it sets off from the gate itself, so it is not stopped twice.
        if (job.kind === 'Release' && job.at < GATE && next >= GATE) {
          job.at = GATE;
          job.waiting = true;
        } else if (next >= STAGES.length) {
          merged += 1;
          jobs[lane] = null;
          empty[lane] = SECONDS.empty;
        } else {
          job.at = next;
        }
      }
    },

    /**
     * A person approves the release waiting at the gate.
     * @returns {boolean} false if that job is not waiting there
     */
    approve(id) {
      const job = jobs.find((candidate) => candidate?.id === id);
      if (!job?.waiting) return false;
      job.waiting = false;
      return true;
    },

    /** The jobs on the floor now, by lane: { id, lane, kind, tier, at, waiting }. `at` runs from 0 to 4, a stage to each whole number. */
    get jobs() {
      return jobs.filter(Boolean).map(({ id, lane, kind, tier, at, waiting }) => ({ id, lane, kind, tier, at, waiting }));
    },

    /** The release waiting for a person, or null. */
    get waiting() {
      const job = jobs.find((candidate) => candidate?.waiting);
      return job ? { id: job.id, lane: job.lane, kind: job.kind, tier: job.tier, at: job.at, waiting: true } : null;
    },

    /** How many jobs have been merged so far. */
    get merged() {
      return merged;
    },
  };
}
