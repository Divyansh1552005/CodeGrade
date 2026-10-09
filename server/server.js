import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import WorkItem from './models/WorkItem.js';
import StudentStats from './models/StudentStats.js';
import Notification from './models/Notification.js';
import Answer from './models/Answer.js';
import Problem from './models/Problem.js';
import { connectDB } from './config/db.js';

// Load server/.env regardless of where `node` is invoked from (also covers
// running `node server.js` from inside server/, where this is a no-op on top
// of dotenv's own cwd-relative default).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const PORT = process.env.PORT || 5000;

async function main() {
  await connectDB();
  await Promise.all([WorkItem.init(), Answer.init(), Problem.init(), StudentStats.init(), Notification.init()]);
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
