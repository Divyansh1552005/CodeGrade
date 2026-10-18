// Every limit, threshold and timeout for the AI doubt triage and hint chat lives
// here, with an environment override. Nothing else in the code uses a magic number.
// Read lazily so tests (and .env loaded late) take effect.
function num(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function aiLimits(env = process.env) {
  return {
    triage: {
      rejectThreshold: num(env, 'TRIAGE_REJECT_THRESHOLD', 0.85),
      timeoutMs: num(env, 'TRIAGE_TIMEOUT_MS', 15000),
      stuckMinutes: num(env, 'TRIAGE_STUCK_MINUTES', 5),
      statementMaxChars: num(env, 'TRIAGE_STATEMENT_MAX_CHARS', 1500),
      codeMaxChars: num(env, 'TRIAGE_CODE_MAX_CHARS', 2000),
      reasonMaxChars: num(env, 'TRIAGE_REASON_MAX_CHARS', 240),
      maxDoubtsPerDay: num(env, 'MAX_DOUBTS_PER_DAY', 10),
    },
    hints: {
      maxQuestionsPerDay: num(env, 'HINT_MAX_QUESTIONS_PER_DAY', 2),
      maxMessagesPerDay: num(env, 'HINT_MAX_MESSAGES_PER_DAY', 5),
      maxMessagesPerWindow: num(env, 'HINT_MAX_MESSAGES_PER_WINDOW', 2),
      windowSeconds: num(env, 'HINT_WINDOW_SECONDS', 60),
      refundCapPerDay: num(env, 'REFUND_CAP_PER_DAY', 3),
      maxMessageChars: num(env, 'HINT_MAX_MESSAGE_CHARS', 500),
      maxCodeChars: num(env, 'HINT_MAX_CODE_CHARS', 6000),
      historyMessages: num(env, 'HINT_HISTORY_MESSAGES', 6),
      maxThreadMessages: num(env, 'HINT_MAX_THREAD_MESSAGES', 100),
      maxOutputTokens: num(env, 'HINT_MAX_OUTPUT_TOKENS', 400),
      timeoutMs: num(env, 'HINT_TIMEOUT_MS', 20000),
      maxCodeLines: num(env, 'HINT_MAX_CODE_LINES', 8),
      maxReplyChars: num(env, 'HINT_MAX_REPLY_CHARS', 1800),
      maxLevel: 4,
    },
    ai: {
      // Per process, not cluster-wide: each API or worker process has its own cap.
      maxConcurrentCalls: num(env, 'AI_MAX_CONCURRENT_CALLS', 4),
      queueWaitMs: num(env, 'AI_QUEUE_WAIT_MS', 5000),
    },
  };
}
