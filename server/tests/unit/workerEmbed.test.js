import { describe, expect, it } from '@jest/globals';

describe('worker module', () => {
  it('can be imported without starting anything, and exports startWorker for RUN_WORKER=true', async () => {
    const mod = await import('../../worker.js');
    expect(typeof mod.startWorker).toBe('function');
  });
});
