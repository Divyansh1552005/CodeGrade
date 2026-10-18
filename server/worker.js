import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { Queue, Worker } from 'bullmq';
import WorkItem from './models/WorkItem.js';
import StudentStats from './models/StudentStats.js';
import UserStats from './models/UserStats.js';
import Badge from './models/Badge.js';
import UserBadge from './models/UserBadge.js';
import GamificationEvent from './models/GamificationEvent.js';
import Notification from './models/Notification.js';
import Submission from './models/Submission.js';
import Doubt from './models/Doubt.js';
import { connectDB } from './config/db.js';
import { validateMailConfig } from './config/mail.js';
import { QUEUE_NAMES, createWorkerConnection, createQueues, queueOptions, reportQueueError } from './services/queueRuntime.js';
import { processWork, failWork } from './services/workProcessor.js';
import { recalculateDifficulties } from './services/difficultyService.js';
import { dispatchPendingWork, reconcileWork } from './services/recoveryService.js';

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)) });

async function main() {
  validateMailConfig(); // fail fast, before connecting, when an email flag is on and the config is wrong
  await connectDB();
  // Build new unique indexes before workers accept replayable imports/drafts.
  const { default: Answer } = await import('./models/Answer.js');
  const { default: Problem } = await import('./models/Problem.js');
  await Promise.all([WorkItem.init(), Answer.init(), Problem.init(), Submission.init(), Doubt.init(), StudentStats.init(), Notification.init(), UserStats.init(), Badge.init(), UserBadge.init(), GamificationEvent.init()]);
  const connection = createWorkerConnection();
  const queues = createQueues(connection);
  const workers = [...new Set(Object.values(QUEUE_NAMES))].map((name) => {
    const concurrency = name === 'submission-grading' ? 2 : name === 'bulk-jobs' ? 1 : 2;
    const worker = new Worker(name, processWork, { ...queueOptions(connection), concurrency });
    worker.on('error', reportQueueError);
    worker.on('failed', (job, err) => {
      console.error(`${name} job ${job?.id} failed:`, err.message);
      if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
        WorkItem.findById(job.data.workItemId).then((work) => work && failWork(work, err)).catch(console.error);
      }
    });
    return worker;
  });
  const maintenanceQueue = new Queue('queue-maintenance', queueOptions(connection));
  maintenanceQueue.on('error', reportQueueError);
  let reconciling = false;
  const reconcile = async () => {
    if (reconciling) return;
    reconciling = true;
    try { await reconcileWork(queues); } finally { reconciling = false; }
  };
  const maintenance = new Worker('queue-maintenance', async (job) => job.name === 'difficulty' ? recalculateDifficulties() : reconcile(), { ...queueOptions(connection), concurrency: 1 });
  maintenance.on('error', reportQueueError);
  workers.push(maintenance);
  let closing = false, dispatching = false, timer;
  const dispatch = async () => {
    if (closing || dispatching) return;
    dispatching = true;
    try { await dispatchPendingWork(queues); }
    catch (err) { reportQueueError(err); }
    finally { dispatching = false; }
  };
  async function shutdown() {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    await Promise.all(workers.map((worker) => worker.close()));
    // Any interrupted outbox dispatch is recovered from Mongo on restart.
    await Promise.all([...new Set([...Object.values(queues), maintenanceQueue])].map((queue) => queue.close()));
    if (connection.status === 'ready') await connection.quit();
    else connection.disconnect();
    await mongoose.disconnect();
  }
  process.on('SIGTERM', () => shutdown().catch(console.error));
  process.on('SIGINT', () => shutdown().catch(console.error));
  await connection.ping();
  if (closing) return;
  await maintenanceQueue.upsertJobScheduler('reconcile-work', { every: 60000 }, {
    name: 'reconcile', data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 10, removeOnFail: 20 },
  });
  await maintenanceQueue.upsertJobScheduler('recalculate-difficulty', { every: 3600000 }, {
    name: 'difficulty', data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 10, removeOnFail: 20 },
  });
  await recalculateDifficulties();
  await reconcile();
  await dispatch();
  timer = setInterval(dispatch, 2000);
  await Promise.all(workers.map((worker) => worker.waitUntilReady()));
  console.log('Workers ready: grading, doubt triage, drafts, feedback, completion, notifications, bulk jobs, recovery');
}
main().catch((err) => {
  console.error('Failed to start workers:', err);
  process.exit(1);
});
