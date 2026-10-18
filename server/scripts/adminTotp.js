// Generates an authenticator secret for the admin account. The secret and the otpauth:// URI are printed to
// the terminal only: never to a log, a file or a pipe (it refuses to run when the output is not a terminal,
// unless you pass --allow-pipe on purpose).
//
//   node scripts/adminTotp.js
//
// Put the printed value in ADMIN_TOTP_SECRET on the API service and restart it. Add the URI to an
// authenticator app (paste the secret if the app cannot read a URI). Lost your authenticator? Remove
// ADMIN_TOTP_SECRET and restart the API; the admin can log in with the password alone until a new secret is set.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { generateSecret, otpauthUri } from '../utils/totp.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.stdout.isTTY && !process.argv.includes('--allow-pipe')) {
    console.error('Refusing to print a secret to a pipe or file. Run this in a terminal, or pass --allow-pipe if you really mean it.');
    process.exit(1);
  }
  dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'), quiet: true });
  const account = (process.env.ADMIN_EMAIL || 'admin').trim();
  const secret = generateSecret();
  console.log('\nADMIN_TOTP_SECRET=' + secret);
  console.log('\nAuthenticator URI:\n' + otpauthUri({ secret, account }) + '\n');
  console.log('Set ADMIN_TOTP_SECRET on the API service and restart it. Keep it as secret as the password.');
}
