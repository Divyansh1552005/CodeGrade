import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';

// Load the root .env regardless of where `node` is invoked from, and fall back
// to a local server/.env if one exists.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const PORT = process.env.PORT || 5000;

async function main() {
  await connectDB();
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
