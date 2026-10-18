import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';

/**
 * Lazily construct the chat model for the configured provider. Kept in one place
 * so both chains share config and tests can mock this module.
 *
 * Provider is chosen with LLM_PROVIDER ('gemini' | 'groq', default 'gemini'):
 *   gemini → uses GOOGLE_API_KEY + GEMINI_MODEL
 *   groq   → uses GROQ_API_KEY   + GROQ_MODEL
 */
let cached = null; // test override
const byOptions = new Map();

function buildModel({ maxOutputTokens } = {}) {
  const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();

  if (provider === 'groq') {
    return new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.2,
      maxRetries: 2,
      ...(maxOutputTokens ? { maxTokens: maxOutputTokens } : {}),
    });
  }

  if (provider === 'gemini') {
    return new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      temperature: 0.2,
      maxRetries: 2,
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
    });
  }

  throw new Error(`Unknown LLM_PROVIDER: "${provider}" (expected "gemini" or "groq")`);
}

/** The chat model. Pass `maxOutputTokens` to cap the reply length (one cached instance per setting). */
export function getModel(options = {}) {
  if (cached) return cached;
  const key = String(options.maxOutputTokens || '');
  if (!byOptions.has(key)) byOptions.set(key, buildModel(options));
  return byOptions.get(key);
}

/** "provider:model", recorded with every AI decision for audit. Never contains a key. */
export function getModelName() {
  const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const model = provider === 'groq'
    ? process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
    : process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  return `${provider}:${model}`;
}

// Allow tests to inject a fake model.
export function __setModelForTest(model) {
  cached = model;
}
