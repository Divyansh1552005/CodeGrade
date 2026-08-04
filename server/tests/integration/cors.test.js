import { describe, it, expect, afterEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app.js';

// createApp() reads process.env.CLIENT_ORIGIN at call time, so each test can
// set it before building a fresh app instance.
const ORIGINAL = process.env.CLIENT_ORIGIN;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CLIENT_ORIGIN;
  else process.env.CLIENT_ORIGIN = ORIGINAL;
});

describe('CORS origin allowlist (CLIENT_ORIGIN)', () => {
  it('reflects any origin when CLIENT_ORIGIN is unset (dev default)', async () => {
    delete process.env.CLIENT_ORIGIN;
    const app = createApp();
    const res = await request(app).get('/health').set('Origin', 'https://anything.example.com');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://anything.example.com');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows an exact match from a comma-separated CLIENT_ORIGIN list', async () => {
    process.env.CLIENT_ORIGIN = 'https://app.example.com,https://other.example.com';
    const app = createApp();
    const res = await request(app).get('/health').set('Origin', 'https://other.example.com');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://other.example.com');
  });

  it('rejects an origin not on the allowlist', async () => {
    process.env.CLIENT_ORIGIN = 'https://app.example.com';
    const app = createApp();
    const res = await request(app).get('/health').set('Origin', 'https://evil.example.com');
    // The cors package surfaces a disallowed origin as a 500 from its error
    // callback; either way, no CORS header should be granted to the caller.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('supports a "*" wildcard, e.g. covering every Vercel preview deployment', async () => {
    process.env.CLIENT_ORIGIN = 'https://*.vercel.app';
    const app = createApp();
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://my-app-git-feature-xyz.vercel.app');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://my-app-git-feature-xyz.vercel.app'
    );
  });

  it('allows requests with no Origin header (server-to-server / curl)', async () => {
    process.env.CLIENT_ORIGIN = 'https://app.example.com';
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
