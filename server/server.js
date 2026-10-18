import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import WorkItem from './models/WorkItem.js';
import StudentStats from './models/StudentStats.js';
import UserStats from './models/UserStats.js';
import Badge from './models/Badge.js';
import UserBadge from './models/UserBadge.js';
import GamificationEvent from './models/GamificationEvent.js';
import Notification from './models/Notification.js';
import Answer from './models/Answer.js';
import Problem from './models/Problem.js';
import Submission from './models/Submission.js';
import Doubt from './models/Doubt.js';
import User from './models/User.js';
import { connectDB } from './config/db.js';
import { validateAdminConfig } from './services/adminConfig.js';
import { bootstrapAdmin } from './services/adminBootstrap.js';
import { validateMailConfig } from './config/mail.js';

// Load server/.env regardless of where `node` is invoked from (also covers
// running `node server.js` from inside server/, where this is a no-op on top
// of dotenv's own cwd-relative default).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const PORT = process.env.PORT || 5000;

async function main() {
  validateMailConfig(); // fail fast, before connecting, when an email flag is on and the config is wrong
  await connectDB();
  await Promise.all([User.init(), WorkItem.init(), Answer.init(), Problem.init(), Submission.init(), Doubt.init(), StudentStats.init(), Notification.init(), UserStats.init(), Badge.init(), UserBadge.init(), GamificationEvent.init()]);
  await bootstrapAdmin(); // API process only, once at startup
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
