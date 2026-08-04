import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock axios BEFORE importing the client (ESM module mocking).
const post = jest.fn();
const get = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: {
    create: () => ({ post, get }),
  },
}));

const { runOnce, assertRunnable, Judge0Error, MAX_CODE_LENGTH } = await import(
  '../../services/judge0Client.js'
);

beforeEach(() => {
  post.mockReset();
  get.mockReset();
});

describe('assertRunnable (input validation before execution)', () => {
  it('rejects an unsupported language', () => {
    expect(() => assertRunnable('ruby', 'x')).toThrow(Judge0Error);
  });

  it('rejects empty code', () => {
    expect(() => assertRunnable('python', '')).toThrow(Judge0Error);
  });

  it('rejects oversized code', () => {
    const big = 'a'.repeat(MAX_CODE_LENGTH + 1);
    expect(() => assertRunnable('python', big)).toThrow(/maximum length/);
  });

  it('accepts valid input', () => {
    expect(() => assertRunnable('javascript', 'console.log(1)')).not.toThrow();
  });
});

describe('runOnce', () => {
  it('returns normalized output on an accepted run', async () => {
    post.mockResolvedValue({
      data: { stdout: '42\n', stderr: null, status: { id: 3, description: 'Accepted' } },
    });
    const res = await runOnce({ language: 'python', code: 'print(42)', stdin: '' });
    expect(res.stdout).toBe('42\n');
    expect(res.statusId).toBe(3);
  });

  it('maps a request timeout to a 504 Judge0Error', async () => {
    post.mockRejectedValue({ code: 'ECONNABORTED' });
    await expect(
      runOnce({ language: 'python', code: 'print(1)' })
    ).rejects.toMatchObject({ name: 'Judge0Error', status: 504 });
  });

  it('maps a non-2xx response to a 502 Judge0Error', async () => {
    post.mockRejectedValue({ response: { status: 500 } });
    await expect(
      runOnce({ language: 'python', code: 'print(1)' })
    ).rejects.toMatchObject({ name: 'Judge0Error', status: 502 });
  });

  it('validates language before making any HTTP call', async () => {
    await expect(runOnce({ language: 'ruby', code: 'x' })).rejects.toThrow(Judge0Error);
    expect(post).not.toHaveBeenCalled();
  });
});
