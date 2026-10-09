import Doubt from '../models/Doubt.js';
import Answer from '../models/Answer.js';
import { generateDraftAnswer, NotRelevantError } from './doubtDraftChain.js';

export async function processDoubtDraft(job) {
  const doubt = await Doubt.findById(job.data.doubtId);
  if (!doubt || ['success', 'irrelevant'].includes(doubt.aiDraftStatus)) return;
  // Teacher answers and previously committed AI drafts survive retries.
  const existing = await Answer.findOne({ doubtId: doubt.id });
  if (existing) {
    await Doubt.updateOne({ _id: doubt.id }, { $set: { aiDraftStatus: 'success' } });
    return;
  }
  try {
    await Doubt.updateOne({ _id: doubt.id }, { $set: { aiDraftStatus: 'pending' } });
    const { draftAnswer } = await generateDraftAnswer({ title: doubt.title, body: doubt.body });
    // A teacher may have answered while the model was running.
    if (!(await Answer.exists({ doubtId: doubt.id, source: 'teacher' }))) {
      try {
        await Answer.create({ doubtId: doubt.id, content: draftAnswer, source: 'ai', state: 'pending',
          generationKey: `draft-${doubt.id}` });
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
    }
    await Doubt.updateOne({ _id: doubt.id }, { $set: { aiDraftStatus: 'success' }, $unset: { aiDraftError: '' } });
  } catch (err) {
    if (err instanceof NotRelevantError) {
      await Doubt.updateOne({ _id: doubt.id }, { $set: { aiDraftStatus: 'irrelevant' } });
      return;
    }
    // The runner marks failed only after the retry budget is exhausted.
    throw err;
  }
}
