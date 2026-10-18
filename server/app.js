import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.js';
import problemRoutes from './routes/problems.js';
import submissionRoutes from './routes/submissions.js';
import doubtRoutes from './routes/doubts.js';
import answerRoutes from './routes/answers.js';
import leaderboardRoutes from './routes/leaderboard.js';
import activityRoutes from './routes/activity.js';
import jobRoutes from './routes/jobs.js';
import featureRoutes from './routes/features.js';
import notificationRoutes from './routes/notifications.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';

/**
 * Build a CORS `origin` option from CLIENT_ORIGIN: a comma-separated list of
 * allowed origins, each optionally containing `*` as a wildcard (e.g.
 * "https://*.vercel.app" to cover every preview deployment alongside the
 * production domain). Falls back to reflecting any origin when CLIENT_ORIGIN
 * is unset, which matches same-origin dev (the Vite proxy) — but this must be
 * set explicitly in production: credentialed CORS (cookies) with an
 * unrestricted origin is not something to expose to the internet, only
 * acceptable here as a permissive local-dev default.
 */
function buildCorsOrigin() {
  const raw = process.env.CLIENT_ORIGIN;
  if (!raw) return true;

  const patterns = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(
      (pattern) =>
        new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
    );

  return (origin, callback) => {
    // No Origin header (curl, server-to-server calls, same-origin) — allow.
    if (!origin) return callback(null, true);
    if (patterns.some((re) => re.test(origin))) return callback(null, true);
    const error = new Error(`CORS: origin ${origin} not allowed`);
    error.status = 403;
    return callback(error);
  };
}

/** Build the Express app (no DB connection here — see server.js / tests). */
export function createApp() {
  const app = express();

  // Behind Render's (or any) reverse proxy — affects req.ip/req.secure.
  app.set('trust proxy', 1);

  app.use(requestId);

  // Credentialed CORS so the browser sends/receives the httpOnly refresh cookie.
  app.use(
    cors({
      origin: buildCorsOrigin(),
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', authRoutes);
  app.use('/problems', problemRoutes);
  app.use('/submissions', submissionRoutes);
  app.use('/doubts', doubtRoutes);
  app.use('/answers', answerRoutes);
  app.use('/activity', activityRoutes);
  app.use('/leaderboard', leaderboardRoutes);
  app.use('/jobs', jobRoutes);
  app.use('/features', featureRoutes);
  app.use('/notifications', notificationRoutes);

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);

  return app;
}

export default createApp;
