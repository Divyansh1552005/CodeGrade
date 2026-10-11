import { readFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import dotenv from 'dotenv';
import Redis from 'ioredis';
import { MongoMemoryServer } from 'mongodb-memory-server';

const folder = new URL('./', import.meta.url);
const config = dotenv.parse(await readFile(new URL('../../.env', import.meta.url)).catch(() => ''));
await mkdir(new URL('./runtime/', folder), { recursive: true });
process.env.MONGOMS_DOWNLOAD_DIR = new URL('./runtime/mongodb/', folder).pathname;
process.env.MONGOMS_DISTRO = 'ubuntu-22.04';
process.env.MONGOMS_VERSION = '7.0.14';
const report = { node: process.version, os: os.type(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model,
  logicalCores: os.cpus().length, ramBytes: os.totalmem(), credentialsPresent: {
    redis: Boolean(process.env.REDIS_URL || config.REDIS_URL), judge0: Boolean(process.env.JUDGE0_API_KEY || config.JUDGE0_API_KEY),
    google: Boolean(process.env.GOOGLE_API_KEY || config.GOOGLE_API_KEY), groq: Boolean(process.env.GROQ_API_KEY || config.GROQ_API_KEY),
  } };
let mongo, redis;
try {
  mongo = await MongoMemoryServer.create();
  report.mongo = { available: true, version: '7.0.14' };
} catch (e) { report.mongo = { available: false, reason: e.code || e.name }; }
try {
  if (!report.credentialsPresent.redis) throw new Error('Missing REDIS_URL');
  redis = new Redis(process.env.REDIS_URL || config.REDIS_URL, { lazyConnect: true, connectTimeout: 8000, maxRetriesPerRequest: 1, retryStrategy: () => null });
  redis.on('error', () => {});
  await redis.connect();
  await redis.ping();
  report.redis = { available: true, version: (await redis.info('server')).match(/redis_version:([^\r\n]+)/)?.[1],
    evictionPolicy: (await redis.info('memory')).match(/maxmemory_policy:([^\r\n]+)/)?.[1] };
} catch (e) { report.redis = { available: false, reason: e.code || e.name }; }
finally { redis?.disconnect(); if (mongo) await mongo.stop(); }
await writeFile(new URL('./runtime/environment.json', folder), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
