import { aiLimits } from '../config/aiLimits.js';

/** Thrown when every AI slot is busy for longer than the wait budget. */
export class AiBusyError extends Error {
  constructor() {
    super('The AI service is busy. Try again in a moment.');
    this.name = 'AiBusyError';
    this.status = 503;
  }
}

// Bounds how many model calls run at once in THIS process. It is per process, not
// cluster-wide: with several API or worker processes the real ceiling is the cap
// multiplied by the number of processes.
let active = 0;
const waiters = [];

function release() {
  active -= 1;
  const next = waiters.shift();
  if (next) { active += 1; clearTimeout(next.timer); next.resolve(); }
}

export async function withAiSlot(fn) {
  const { maxConcurrentCalls, queueWaitMs } = aiLimits().ai;
  if (active >= maxConcurrentCalls) {
    await new Promise((resolve, reject) => {
      const waiter = { resolve };
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new AiBusyError());
      }, queueWaitMs);
      waiters.push(waiter);
    });
  } else {
    active += 1;
  }
  try {
    return await fn();
  } finally {
    release();
  }
}

export function __activeForTest() {
  return { active, waiting: waiters.length };
}
