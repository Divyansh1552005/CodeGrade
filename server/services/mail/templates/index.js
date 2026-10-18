import { verifyEmail } from './verifyEmail.js';
import { resetPassword } from './resetPassword.js';
import { passwordChanged } from './passwordChanged.js';
import { accountExists } from './accountExists.js';
import { teacherApplication } from './teacherApplication.js';
import { teacherApproved } from './teacherApproved.js';
import { teacherRejected } from './teacherRejected.js';

// One entry per email kind. A new kind is a template file and a line here.
export const TEMPLATES = {
  'verify-email': verifyEmail,
  'password-reset': resetPassword,
  'password-changed': passwordChanged,
  'account-exists': accountExists,
  'teacher-application': teacherApplication,
  'teacher-approved': teacherApproved,
  'teacher-rejected': teacherRejected,
};
export { verifyEmail, resetPassword, passwordChanged, accountExists, teacherApplication, teacherApproved, teacherRejected };
