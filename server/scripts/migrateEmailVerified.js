// Marks every user that existed before email verification as verified, so nobody is locked out when
// email verification is in use (it always is now). Run it once on a database that already has users. Safe to run repeatedly.
//
//   node scripts/migrateEmailVerified.js --dry-run   # count the users it would change, change nothing
//   node scripts/migrateEmailVerified.js             # do it
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { markLegacyUsersVerified } from '../services/emailMaintenance.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
  const dryRun = process.argv.includes('--dry-run');
  try {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
    await mongoose.connect(process.env.MONGODB_URI);
    const result = await markLegacyUsersVerified({ dryRun });
    console.log(dryRun
      ? `Dry run on "${mongoose.connection.name}": ${result.matched} user(s) would be marked verified. Nothing was changed.`
      : `Marked ${result.modified} of ${result.matched} matching user(s) verified in "${mongoose.connection.name}".`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
