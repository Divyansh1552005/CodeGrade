import { describe, it, expect } from '@jest/globals';
import { RunnableLambda } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';
import { generateFeedback, feedbackSchema } from '../../services/aiFeedbackChain.js';
import {
  generateDraftAnswer,
  draftSchema,
  NOT_RELEVANT_SENTINEL,
  NotRelevantError,
} from '../../services/doubtDraftChain.js';

/**
 * A fake chat model whose withStructuredOutput() returns a Runnable that always
 * yields `payload` — for the structured feedback chain.
 */
function fakeModel(payload) {
  return {
    withStructuredOutput() {
      return RunnableLambda.from(async () => payload);
    },
  };
}

/**
 * A fake chat model that returns a plain-text AIMessage — for the doubt-draft
 * chain, which pipes through a StringOutputParser.
 */
function fakeChat(text) {
  return RunnableLambda.from(async () => new AIMessage(text));
}

describe('aiFeedbackChain', () => {
  it('parses a well-formed structured response', async () => {
    const model = fakeModel({
      summary: 'Looks good',
      strengths: ['clear'],
      improvements: ['add tests'],
      complexityNote: 'O(n)',
    });
    const out = await generateFeedback({
      language: 'python',
      code: 'print(1)',
      passCount: 1,
      totalCount: 1,
      testResults: [{ passed: true }],
      model,
    });
    expect(() => feedbackSchema.parse(out)).not.toThrow();
    expect(out.summary).toBe('Looks good');
  });

  it('rejects a malformed response instead of silently accepting it', async () => {
    // strengths should be an array of strings; give it garbage.
    const model = fakeModel({ summary: 'x', strengths: 'nope' });
    await expect(
      generateFeedback({ language: 'python', code: 'x', model })
    ).rejects.toThrow();
  });
});

describe('doubtDraftChain', () => {
  it('returns only a draftAnswer string from plain-text output', async () => {
    const model = fakeChat('Use a hash map.');
    const out = await generateDraftAnswer({ title: 'q', body: 'how?', model });
    expect(() => draftSchema.parse(out)).not.toThrow();
    expect(out.draftAnswer).toBe('Use a hash map.');
    // Crucially, the chain output has no state/role fields.
    expect(out).not.toHaveProperty('state');
    expect(out).not.toHaveProperty('role');
  });

  it('handles answers containing fenced code blocks (the reported crash)', async () => {
    const codeAnswer = '```cpp\n#include <iostream>\nint main(){return 0;}\n```';
    const model = fakeChat(codeAnswer);
    const out = await generateDraftAnswer({ title: 'c++ help', body: 'hello world?', model });
    expect(out.draftAnswer).toBe(codeAnswer);
  });

  it('rejects an empty draft', async () => {
    const model = fakeChat('   ');
    await expect(generateDraftAnswer({ title: 'q', body: 'b', model })).rejects.toThrow();
  });

  it('throws NotRelevantError when the model flags the doubt as off-topic', async () => {
    const model = fakeChat(NOT_RELEVANT_SENTINEL);
    await expect(
      generateDraftAnswer({ title: 'How to cook Maggi', body: 'boil water...', model })
    ).rejects.toThrow(NotRelevantError);
  });

  it('strips any privileged field the model tries to inject (state/role)', () => {
    // Defense-in-depth: even if a manipulated model returns state/role, the Zod
    // schema keeps only draftAnswer, so LLM output can never change app state.
    const parsed = draftSchema.parse({
      draftAnswer: 'hello',
      state: 'approved',
      role: 'teacher',
    });
    expect(parsed).toEqual({ draftAnswer: 'hello' });
    expect(parsed).not.toHaveProperty('state');
  });
});
