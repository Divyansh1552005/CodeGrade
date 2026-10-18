import { describe, it, expect } from '@jest/globals';
import { inspectReply, fallbackHint } from '../../services/hintGuardrail.js';

const limits = { maxCodeLines: 8, maxReplyChars: 1800 };
const check = (text) => inspectReply(text, limits);
const block = (n, fence = '```') => `${fence}python\n${Array.from({ length: n }, (_, i) => `x${i} = ${i}`).join('\n')}\n${fence}`;

describe('hint reply guardrail', () => {
  it('accepts plain prose and a tiny snippet of up to 8 lines', () => {
    expect(check('Think about what you need to remember while scanning the list.').ok).toBe(true);
    expect(check(`Here is the syntax for a dict lookup:\n${block(3)}\nNow apply it.`).ok).toBe(true);
    expect(check(block(8)).ok).toBe(true);
  });
  it('rejects a fenced block longer than 8 lines', () => {
    expect(check(block(9))).toEqual({ ok: false, reasons: ['long_code_block'] });
    expect(check(block(9, '~~~')).reasons).toContain('long_code_block');
  });
  it('counts only non-empty lines inside the fence', () => {
    expect(check(`\`\`\`\n${'a = 1\n\n'.repeat(8)}\`\`\``).ok).toBe(true);
  });
  it('rejects an unclosed fence that runs past the limit', () => {
    expect(check(`Here you go:\n\`\`\`python\n${Array.from({ length: 12 }, (_, i) => `y${i} = 1`).join('\n')}`).reasons).toContain('long_code_block');
  });
  it('rejects several blocks that add up to a solution', () => {
    expect(check(`${block(7)}\nthen\n${block(7)}\nthen\n${block(7)}`).reasons).toContain('too_much_code');
  });
  it('rejects a long run of unfenced code lines', () => {
    const run = Array.from({ length: 10 }, (_, i) => `    total = total + nums[${i}];`).join('\n');
    expect(check(`Use this:\n${run}`).reasons).toContain('inline_code_run');
    const keywords = ['def solve(nums):', '    seen = {}', '    for n in nums:', '        seen[n] = 1;', '    return seen', 'class A:', '    x = 1;', '    y = 2;', '    z = 3;'].join('\n');
    expect(check(keywords).ok).toBe(false);
  });
  it('does not mistake indented prose for code', () => {
    const prose = Array.from({ length: 12 }, () => '    Consider the (smallest) input first.').join('\n');
    expect(check(prose).ok).toBe(true);
  });
  it('rejects a very long reply and an empty one', () => {
    expect(check('word '.repeat(500)).reasons).toContain('too_long');
    expect(check('   ')).toEqual({ ok: false, reasons: ['empty'] });
  });
  it('rejects a long numbered step-by-step list', () => {
    const steps = Array.from({ length: 10 }, (_, i) => `${i + 1}. Do step ${i + 1}.`).join('\n');
    expect(check(steps).reasons).toContain('long_step_list');
    expect(check('1. First.\n2. Second.\n3. Third.').ok).toBe(true);
  });
  it('uses the configured limits by default', () => {
    expect(inspectReply(block(9)).ok).toBe(false);
    expect(inspectReply(block(8)).ok).toBe(true);
  });
  it('has a safe fallback for every level that contains no code', () => {
    for (const level of [1, 2, 3, 4, 0, 99]) {
      const text = fallbackHint(level);
      expect(text.length).toBeGreaterThan(40);
      expect(inspectReply(text).ok).toBe(true);
    }
    expect(fallbackHint(1)).not.toBe(fallbackHint(4));
  });
});
