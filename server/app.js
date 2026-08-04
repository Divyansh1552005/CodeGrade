import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.js';
import problemRoutes from './routes/problems.js';
import submissionRoutes from './routes/submissions.js';
import doubtRoutes from './routes/doubts.js';
import answerRoutes from './routes/answers.js';
import { errorHandler } from './middleware/errorHandler.js';

/** Build the Express app (no DB connection here — see server.js / tests). */
export function createApp() {
  const app = express();

  // Credentialed CORS so the browser sends/receives the httpOnly refresh cookie.
  // In dev the Vite proxy makes requests same-origin; CLIENT_ORIGIN covers a
  // split-origin deployment.
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || true,
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

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);

  return app;
}

export default createApp;
