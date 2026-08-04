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
