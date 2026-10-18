import { Router } from 'express';
import { z } from 'zod';
import Problem from '../models/Problem.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { validate } from '../middleware/validate.js';
import { httpError } from '../middleware/errorHandler.js';
import { objectId } from '../validation/schemas.js';
import { LIMITS } from '../utils/sanitize.js';
import { aiLimits } from '../config/aiLimits.js';
import { reserve, refund, getQuota } from '../services/hintQuota.js';
import { generateHint, HintAiError } from '../services/hintChain.js';
import { latestVerdict, hasAccepted, nextLevel, loadThread, saveExchange } from '../services/hintContext.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireRole('student'));

const params = z.object({ problemId: objectId });
// Built per request so the limit follows the environment. Unknown fields (a client-supplied
// verdict, for example) are dropped by the schema and never read.
const bodySchema = () => z.object({
  message: z.string().trim().min(1, 'message is required').max(aiLimits().hints.maxMessageChars, `message must be at most ${aiLimits().hints.maxMessageChars} characters`),
  code: z.string().max(LIMITS.code).optional(),
});

// Only the fields a hint may use. Test cases are never loaded.
const PROBLEM_FIELDS = 'title description inputFormat outputFormat constraints topics difficulty sampleCases';
async function findProblem(problemId) {
  const problem = await Problem.findOne({ _id: problemId, archived: { $ne: true } }).select(PROBLEM_FIELDS).lean();
  if (!problem) throw httpError(404, 'Problem not found');
  return problem;
}

const present = (m) => ({ id: String(m._id), role: m.role, content: m.content, level: m.level, fallback: Boolean(m.fallback), createdAt: m.createdAt });
const quotaView = (q) => ({ messagesLeft: q.messagesLeft, resetAt: q.resetAt, retryAfterSeconds: q.retryAfterSeconds });
const secondsUntil = (date) => Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));

// GET /problems/:problemId/hints — the student's own thread and what is left today.
router.get('/', validate(params, 'params'), async (req, res, next) => {
  try {
    await findProblem(req.params.problemId);
    const [thread, quota, accepted] = await Promise.all([
      loadThread(req.user._id, req.params.problemId),
      getQuota({ userId: req.user._id }),
      hasAccepted(req.user._id, req.params.problemId),
    ]);
    res.json({
      messages: thread.messages.map(present), hintsUsed: thread.hintsUsed, level: nextLevel(thread.hintsUsed),
      acceptedMode: accepted, quota: quotaView(quota),
    });
  } catch (err) { next(err); }
});

function blockedBody(block) {
  const { hints } = aiLimits();
  const { limit, quota } = block;
  const retryAfterSeconds = limit === 'rate' ? quota.retryAfterSeconds : secondsUntil(quota.resetAt);
  const error = {
    daily_messages: `You have used all ${hints.maxMessagesPerDay} hint messages for today. They reset at midnight India time.`,
    rate: `You can send ${hints.maxMessagesPerWindow} hint messages per ${hints.windowSeconds} seconds. Try again in ${retryAfterSeconds} seconds.`,
  }[limit];
  return { status: 429, retryAfterSeconds, body: { error, limit, retryAfterSeconds, resetAt: quota.resetAt, quota: quotaView(quota) } };
}

// POST /problems/:problemId/hints { message, code? } — ask for the next hint.
router.post('/', validate(params, 'params'), (req, res, next) => validate(bodySchema())(req, res, next), async (req, res, next) => {
  const started = Date.now();
  const userId = req.user._id;
  const { problemId } = req.params;
  let attempt = null;
  const giveBack = async () => {
    if (!attempt) return { refunded: false };
    try {
      return await refund({ userId, attemptId: attempt.attemptId, day: attempt.day });
    } catch (err) {
      req.log.error('hint.refund.failed', { error: err.message });
      return { refunded: false };
    }
  };
  try {
    const problem = await findProblem(problemId);

    // All three limits are checked and consumed in one atomic step. A blocked request stops here
    // without touching a counter and without calling the model.
    const slot = await reserve({ userId, problemId });
    if (!slot.ok) {
      const blocked = blockedBody(slot);
      res.set('Retry-After', String(blocked.retryAfterSeconds));
      return res.status(blocked.status).json(blocked.body);
    }
    attempt = slot;

    const { message, code } = req.body;
    const [thread, verdict, accepted] = await Promise.all([
      loadThread(userId, problemId), latestVerdict(userId, problemId), hasAccepted(userId, problemId),
    ]);
    const level = nextLevel(thread.hintsUsed);

    let hint;
    try {
      hint = await generateHint({ problem, code, verdict, history: thread.messages, level, accepted, message });
    } catch (err) {
      if (!(err instanceof HintAiError)) throw err;
      const given = await giveBack();
      const quota = await getQuota({ userId });
      req.log.warn('hint.failed', { kind: err.kind, refunded: given.refunded, durationMs: Date.now() - started });
      const status = { busy: 503, timeout: 504 }[err.kind] || 502;
      return res.status(status).json({
        error: err.kind === 'busy' ? 'The hint service is busy. Try again in a moment.' : 'The hint service is not available right now. Try again in a moment.',
        refunded: given.refunded, quota: quotaView(quota),
      });
    }

    // A guardrail fallback is saved and marked, never raises the level, and gives the message back.
    const saved = await saveExchange({ userId, problemId, userText: message, reply: hint.text, level, fallback: hint.fallback });
    const given = hint.fallback ? await giveBack() : { refunded: false };
    const quota = await getQuota({ userId });
    req.log.info('hint.reply', {
      problemId: String(problemId), level, fallback: hint.fallback, attempts: hint.attempts, reasons: hint.reasons,
      refunded: given.refunded, messageLength: message.length, replyLength: hint.text.length, hasCode: Boolean(code),
      verdict: verdict.category, accepted, durationMs: Date.now() - started,
    });
    const [userMessage, reply] = saved.messages;
    return res.json({
      userMessage: present(userMessage), reply: present(reply), fallback: hint.fallback, refunded: given.refunded,
      hintsUsed: saved.hintsUsed, level: nextLevel(saved.hintsUsed), quota: quotaView(quota),
    });
  } catch (err) {
    // Anything unexpected after a message was reserved gives it back before the error is reported.
    await giveBack();
    return next(err);
  }
});

export default router;
