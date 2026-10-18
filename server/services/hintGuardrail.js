import { aiLimits } from '../config/aiLimits.js';

// Heuristic check on a hint reply, run before it is returned. A hint may contain a tiny syntax
// snippet but must not turn into a solution. No extra model call: this is deterministic and free.
const FENCE = /^\s*(```|~~~)/;
const INDENTED_CODE = /^( {4,}|\t)\S/;
const CODE_PUNCTUATION = /[;{}=]|\)\s*:$|->|=>/;
const CODE_KEYWORD = /^\s*(def|class|function|for|while|if|else|elif|return|import|from|#include|public|private|static|int|long|double|const|let|var|print|System\.out|std::)\b/;
const NUMBERED_STEP = /^\s*\d+[.)]\s/;
const MAX_NUMBERED_STEPS = 8;

function looksLikeCode(line) {
  if (!line.trim()) return false;
  if (INDENTED_CODE.test(line) && CODE_PUNCTUATION.test(line)) return true;
  return CODE_KEYWORD.test(line) && (/[({;:=]/.test(line) || /^( {2,}|\t)/.test(line));
}

/** Returns { ok, reasons }. Reasons are short codes, safe to log. */
export function inspectReply(text, { maxCodeLines, maxReplyChars } = aiLimits().hints) {
  const reasons = [];
  const reply = String(text ?? '');
  if (!reply.trim()) return { ok: false, reasons: ['empty'] };
  if (reply.length > maxReplyChars) reasons.push('too_long');

  let inFence = false;
  let blockLines = 0;
  let fencedTotal = 0;
  let run = 0;
  let longestRun = 0;
  let steps = 0;
  const closeBlock = () => {
    if (blockLines > maxCodeLines) reasons.push('long_code_block');
    fencedTotal += blockLines;
    blockLines = 0;
  };
  for (const line of reply.split('\n')) {
    if (FENCE.test(line)) {
      if (inFence) closeBlock();
      inFence = !inFence;
      run = 0;
      continue;
    }
    if (inFence) {
      if (line.trim()) blockLines += 1;
      continue;
    }
    if (NUMBERED_STEP.test(line)) steps += 1;
    run = looksLikeCode(line) ? run + 1 : 0;
    longestRun = Math.max(longestRun, run);
  }
  if (inFence) closeBlock(); // an unclosed fence counts to the end of the reply
  if (fencedTotal > maxCodeLines * 2) reasons.push('too_much_code');
  if (longestRun > maxCodeLines) reasons.push('inline_code_run');
  if (steps > MAX_NUMBERED_STEPS) reasons.push('long_step_list');
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

// Safe replacement when the model keeps producing too much code. One per hint level.
const FALLBACKS = {
  1: 'Start by re-reading the problem statement and the examples. Work the smallest example by hand and write down each step you take. What do you do at every step, and where does your code differ?',
  2: 'Think about which familiar technique fits this kind of problem: what are you repeatedly searching for or counting, and which data structure makes that quick? Try to name the pattern before you write more code.',
  3: 'Describe your approach to yourself in plain sentences: what you keep track of, what you do for each input item, and when you stop. If a sentence is hard to write, that is the part to think through next.',
  4: 'Check the edge cases from the constraints: the smallest and largest inputs, empty or repeated values. Then compare the time and space your approach needs with what the constraints allow.',
};
export const fallbackHint = (level) => FALLBACKS[Math.min(Math.max(Number(level) || 1, 1), 4)];
