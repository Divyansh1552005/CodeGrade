import { runOnce } from './judge0Client.js';

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

    testResults.push({
      input: tc.input ?? '',
      expectedOutput: tc.expectedOutput ?? '',
      actualOutput: normalizeOutput(actualOutput),
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
