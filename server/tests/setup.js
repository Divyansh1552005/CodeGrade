import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { jest, beforeAll, afterAll, afterEach } from '@jest/globals';

// Sensible defaults so modules that read env at import time don't blow up.
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
process.env.JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';
process.env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'test-key';
process.env.GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
process.env.JUDGE0_API_URL = process.env.JUDGE0_API_URL || 'https://judge0-ce.p.rapidapi.com';
process.env.JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || 'test-judge0-key';

// Email verification and password reset are always on, so every test environment needs the email settings.
process.env.EMAIL_TOKEN_SECRET = process.env.EMAIL_TOKEN_SECRET || 'a-test-secret-that-is-at-least-32-characters';
process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'https://app.example.com';
process.env.MAIL_FROM = process.env.MAIL_FROM || 'CodeGrade <no-reply@example.com>';

// Auth responses are padded to a fixed minimum time outside the tests; a test that checks it sets its own value.
process.env.AUTH_RESPONSE_FLOOR_MS = process.env.AUTH_RESPONSE_FLOOR_MS || '0';

jest.setTimeout(30000);

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((c) => c.deleteMany({}))
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
