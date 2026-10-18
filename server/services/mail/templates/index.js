import { verifyEmail } from './verifyEmail.js';
import { resetPassword } from './resetPassword.js';
import { passwordChanged } from './passwordChanged.js';
import { accountExists } from './accountExists.js';

// One entry per email kind. A new kind is a template file and a line here.
export const TEMPLATES = {
  'verify-email': verifyEmail,
  'password-reset': resetPassword,
  'password-changed': passwordChanged,
  'account-exists': accountExists,
};
export { verifyEmail, resetPassword, passwordChanged, accountExists };
