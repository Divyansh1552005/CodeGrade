import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import Answer, { InvalidStateTransitionError } from '../../models/Answer.js';

const doubtId = new mongoose.Types.ObjectId();

function makeAnswer(state = 'draft') {
  return new Answer({ doubtId, content: 'hi', source: 'ai', state });
}

describe('Answer state machine (model-level enforcement)', () => {
  it('allows creating a draft answer', async () => {
    const a = await makeAnswer('draft').save();
    expect(a.state).toBe('draft');
  });

  it('allows draft -> pending (system transition)', async () => {
    const a = await makeAnswer('draft').save();
    a.state = 'pending';
    await a.save();
    expect(a.state).toBe('pending');
  });

  it('allows pending -> approved', async () => {
    const a = await makeAnswer('pending').save();
    a.state = 'approved';
    await a.save();
    expect(a.state).toBe('approved');
  });

  it('allows pending -> rejected', async () => {
    const a = await makeAnswer('pending').save();
    a.state = 'rejected';
    await a.save();
    expect(a.state).toBe('rejected');
  });

  it('rejects draft -> approved (illegal jump)', async () => {
    const a = await makeAnswer('draft').save();
    a.state = 'approved';
    await expect(a.save()).rejects.toThrow(InvalidStateTransitionError);
    const fresh = await Answer.findById(a._id);
    expect(fresh.state).toBe('draft');
  });

  it('rejects re-approving an already-rejected answer (terminal)', async () => {
    const a = await makeAnswer('pending').save();
    a.state = 'rejected';
    await a.save();
    a.state = 'approved';
    await expect(a.save()).rejects.toThrow(InvalidStateTransitionError);
    const fresh = await Answer.findById(a._id);
    expect(fresh.state).toBe('rejected');
  });

  it('rejects transitions out of approved (terminal)', async () => {
    const a = await makeAnswer('pending').save();
    a.state = 'approved';
    await a.save();
    a.state = 'pending';
    await expect(a.save()).rejects.toThrow(InvalidStateTransitionError);
  });

  it('rejects creating directly in approved state', async () => {
    await expect(makeAnswer('approved').save()).rejects.toThrow(
      InvalidStateTransitionError
    );
  });
});
