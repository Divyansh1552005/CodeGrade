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
let cached = null;

function buildModel() {
  const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();

  if (provider === 'groq') {
    return new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.2,
      maxRetries: 2,
    });
  }

  if (provider === 'gemini') {
    return new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      temperature: 0.2,
      maxRetries: 2,
    });
  }

  throw new Error(`Unknown LLM_PROVIDER: "${provider}" (expected "gemini" or "groq")`);
}

export function getModel() {
  if (!cached) cached = buildModel();
  return cached;
}

// Allow tests to inject a fake model.
export function __setModelForTest(model) {
  cached = model;
}
