import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const QUEUE_NAMES = {
  grading: 'submission-grading', 'doubt-triage': 'doubt-triage', 'doubt-draft': 'doubt-drafts', feedback: 'ai-feedback',
  completion: 'submission-completion', notification: 'notifications',
  'problem-import': 'bulk-jobs', 'problem-export': 'bulk-jobs', 'report-export': 'bulk-jobs',
};
export function queueOptions(connection) {
  return { connection, prefix: process.env.QUEUE_PREFIX || 'bull' };
}
export function createWorkerConnection() {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is not set');
  const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null, connectTimeout: 5000 });
  connection.on('error', reportQueueError);
  return connection;
}
let lastError = '';
let lastErrorAt = 0;
export function reportQueueError(error) {
  const now = Date.now();
  if (error.message !== lastError || now - lastErrorAt > 30000) {
    console.error(`Queue connection: ${error.message}. Check REDIS_URL and DNS; pending work remains in MongoDB.`);
    lastError = error.message;
    lastErrorAt = now;
  }
}
export function createQueues(connection) {
  const byName = Object.fromEntries([...new Set(Object.values(QUEUE_NAMES))].map((name) => {
    const queue = new Queue(name, queueOptions(connection));
    queue.on('error', reportQueueError);
    return [name, queue];
  }));
  return Object.fromEntries(Object.entries(QUEUE_NAMES).map(([type, name]) => [type, byName[name]]));
}
