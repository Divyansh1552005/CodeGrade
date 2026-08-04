import axios from 'axios';
import { LANGUAGE_IDS, isSupportedLanguage, languageId } from './languageMap.js';

/**
 * Thin wrapper around the Judge0 CE REST API (via RapidAPI).
 *
 * Safety properties enforced here:
 *  - The backend NEVER executes untrusted student code directly (no eval / no
 *    child_process). Everything is delegated to Judge0's sandbox.
 *  - `language` is validated against an allowlist before any network call.
 *  - Code length is capped to prevent abuse / DoS.
 *  - Every HTTP call has a hard timeout so a hung Judge0 can't hang the API.
 */

// Re-export so existing importers keep working; the source of truth is languageMap.js.
export { LANGUAGE_IDS };

export const MAX_CODE_LENGTH = 20000;
const REQUEST_TIMEOUT_MS = 10000;

// Judge0 status ids: 3 = Accepted. Anything <3 means still processing.
const STATUS_IN_QUEUE = 1;
const STATUS_PROCESSING = 2;

export class Judge0Error extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'Judge0Error';
    this.status = status || 502;
  }
}

function client() {
  const baseURL = process.env.JUDGE0_API_URL || 'https://judge0-ce.p.rapidapi.com';
  const host = new URL(baseURL).host;
  return axios.create({
    baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
      'X-RapidAPI-Host': host,
    },
  });
}

export function assertRunnable(language, code) {
  if (!isSupportedLanguage(language)) {
    throw new Judge0Error(`Unsupported language: ${language}`, 400);
  }
  if (typeof code !== 'string' || code.length === 0) {
    throw new Judge0Error('Code is required', 400);
  }
  if (code.length > MAX_CODE_LENGTH) {
    throw new Judge0Error(
      `Code exceeds maximum length of ${MAX_CODE_LENGTH} characters`,
      400
    );
  }
}

/**
 * Run a single piece of code against one stdin input. Uses the synchronous
 * `wait=true` endpoint but still guards with our own request timeout.
 *
 * @returns {{ stdout: string, stderr: string, statusId: number, statusDescription: string }}
 */
export async function runOnce({ language, code, stdin = '' }) {
  assertRunnable(language, code);

  const http = client();
  let res;
  try {
    res = await http.post(
      '/submissions?base64_encoded=false&wait=true',
      {
        language_id: languageId(language),
        source_code: code,
        stdin,
      }
    );
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      throw new Judge0Error('Judge0 request timed out', 504);
    }
    const status = err.response?.status;
    throw new Judge0Error(
      `Judge0 request failed${status ? ` (HTTP ${status})` : ''}`,
      502
    );
  }

  const data = res.data || {};
  const statusId = data.status?.id;

  // If the sync endpoint didn't finish, fall back to polling by token.
  if ((statusId === STATUS_IN_QUEUE || statusId === STATUS_PROCESSING) && data.token) {
    return pollToken(http, data.token);
  }

  return normalize(data);
}

async function pollToken(http, token, attempts = 10, intervalMs = 800) {
  for (let i = 0; i < attempts; i += 1) {
    let res;
    try {
      res = await http.get(
        `/submissions/${token}?base64_encoded=false`
      );
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        throw new Judge0Error('Judge0 request timed out', 504);
      }
      throw new Judge0Error('Judge0 polling failed', 502);
    }
    const statusId = res.data?.status?.id;
    if (statusId !== STATUS_IN_QUEUE && statusId !== STATUS_PROCESSING) {
      return normalize(res.data);
    }
    await sleep(intervalMs);
  }
  throw new Judge0Error('Judge0 result not ready after polling', 504);
}

function normalize(data) {
  return {
    stdout: data.stdout ?? '',
    stderr: data.stderr ?? '',
    compileOutput: data.compile_output ?? '',
    statusId: data.status?.id,
    statusDescription: data.status?.description ?? 'Unknown',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
