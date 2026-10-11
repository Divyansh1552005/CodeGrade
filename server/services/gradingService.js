import { runOnce } from './judge0Client.js';

const MAX_STORED_OUTPUT_BYTES = 4096;
const OUTPUT_TRUNCATION_MARKER = '\n...[output truncated]';

/**
 * Normalize program output for comparison: trim trailing whitespace on each
 * line and drop trailing blank lines, so a stray newline doesn't fail a case.
 */
function normalizeOutput(str) {
  return String(str ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

function capStoredOutput(output) {
  const bytes = Buffer.from(output, 'utf8');
  if (bytes.length <= MAX_STORED_OUTPUT_BYTES) return output;

  const marker = Buffer.from(OUTPUT_TRUNCATION_MARKER, 'utf8');
  let prefix = bytes.subarray(0, MAX_STORED_OUTPUT_BYTES - marker.length).toString('utf8');
  // Avoid leaving a replacement character when the byte boundary splits a
  // multi-byte UTF-8 code point.
  while (Buffer.byteLength(prefix, 'utf8') > MAX_STORED_OUTPUT_BYTES - marker.length) {
    prefix = prefix.slice(0, -1);
  }
  return `${prefix}${OUTPUT_TRUNCATION_MARKER}`;
}

/**
 * Run `code` against every test case for a problem and produce structured
 * results. Each test case is executed in its own Judge0 sandbox run.
 *
 * @returns {{ testResults: Array, passCount: number, totalCount: number }}
 */
export async function gradeSubmission({ language, code, testCases }) {
  const cases = Array.isArray(testCases) ? testCases : [];
  const testResults = [];

  for (const tc of cases) {
    const result = await runOnce({
      language,
      code,
      stdin: tc.input ?? '',
    });

    const actualOutput = result.stderr || result.compileOutput
      ? (result.stdout || result.stderr || result.compileOutput)
      : result.stdout;

    const passed =
      result.statusId === 3 && // Accepted
      normalizeOutput(actualOutput) === normalizeOutput(tc.expectedOutput);

    const normalizedActualOutput = normalizeOutput(actualOutput);
    testResults.push({
      input: tc.input ?? '',
      expectedOutput: tc.expectedOutput ?? '',
      actualOutput: capStoredOutput(normalizedActualOutput),
      passed,
    });
  }

  const passCount = testResults.filter((r) => r.passed).length;
  return {
    testResults,
    passCount,
    totalCount: testResults.length,
  };
}
