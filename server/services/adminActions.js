import User from '../models/User.js';
import TeacherApplication from '../models/TeacherApplication.js';
import { audit } from './audit.js';
import { revokeAllSessions } from './tokenService.js';
import { queueEmail } from './emailJob.js';
import { emailFeaturesOn } from '../config/mail.js';
import { cleanText } from '../utils/plainText.js';

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

/** The admin account is never a target: not demoted, suspended, promoted or otherwise changed through the API. */
function assertChangeable(target, admin) {
  if (target.role === 'admin' || target.envAdmin) throw fail(409, 'The admin account cannot be changed.', 'ADMIN_PROTECTED');
  if (String(target._id) === String(admin._id)) throw fail(409, 'You cannot change your own account.', 'SELF_PROTECTED');
}

async function findTarget(id, admin) {
  const target = await User.findById(id);
  if (!target) throw fail(404, 'User not found');
  assertChangeable(target, admin);
  return target;
}

/**
 * Student <-> teacher for an existing account. Only students and teachers can be changed here: an applicant
 * is decided on the Applications page, and the admin is out of reach. The update only matches the role that
 * was read, so two quick requests cannot both apply. Sessions end, so the new role applies cleanly.
 * Approved answers stay (they keep pointing at the user); nothing is deleted.
 */
export async function changeRole({ admin, id, role, req }) {
  const target = await findTarget(id, admin);
  if (!['student', 'teacher'].includes(target.role)) throw fail(409, 'Applicants are decided on the Applications page.', 'USE_APPLICATION');
  if (target.role === role) throw fail(409, `Already a ${role}.`, 'NO_CHANGE');
  const update = role === 'teacher' ? { $set: { role, teacherApprovedAt: new Date() } } : { $set: { role }, $unset: { teacherApprovedAt: 1 } };
  const changed = await User.findOneAndUpdate({ _id: target._id, role: target.role }, update, { new: true });
  if (!changed) throw fail(409, 'The account changed while you were editing it. Reload and try again.', 'CONFLICT');
  await revokeAllSessions(target._id);
  await audit({ action: 'role.changed', actor: admin, target, before: { role: target.role }, after: { role }, req });
  return changed;
}

export async function setSuspended({ admin, id, suspended, req }) {
  const target = await findTarget(id, admin);
  const filter = suspended ? { _id: target._id, suspendedAt: { $exists: false } } : { _id: target._id, suspendedAt: { $exists: true } };
  const update = suspended ? { $set: { suspendedAt: new Date(), suspendedBy: admin._id } } : { $unset: { suspendedAt: 1, suspendedBy: 1 } };
  const changed = await User.findOneAndUpdate(filter, update, { new: true });
  if (!changed) throw fail(409, suspended ? 'Already suspended.' : 'Not suspended.', 'NO_CHANGE');
  await revokeAllSessions(target._id);
  await audit({ action: suspended ? 'user.suspended' : 'user.unsuspended', actor: admin, target, before: { status: suspended ? 'active' : 'suspended' }, after: { status: suspended ? 'suspended' : 'active' }, req });
  return changed;
}

// One decision, one atomic update: it only matches an application in a state the decision may start from, so
// two requests (or a double click) cannot both decide it. `decisionSeq` goes up with every decision and keys
// that decision's email.
async function decide({ admin, id, to, from, reason, req }) {
  const set = { status: to, decidedAt: new Date(), decidedBy: admin._id };
  const update = reason ? { $set: { ...set, decisionReason: reason }, $inc: { decisionSeq: 1 } } : { $set: set, $unset: { decisionReason: 1 }, $inc: { decisionSeq: 1 } };
  const application = await TeacherApplication.findOneAndUpdate(
    { _id: id, visibleAt: { $exists: true }, status: { $in: from } }, update, { new: false },
  );
  if (!application) {
    const existing = await TeacherApplication.findById(id).select('status visibleAt');
    if (!existing || !existing.visibleAt) throw fail(404, 'Application not found');
    throw fail(409, `This application is already ${existing.status}.`, 'ALREADY_DECIDED');
  }
  const decided = await TeacherApplication.findById(id);
  const user = await User.findById(application.userId);
  return { application, decided, user };
}

export async function approveApplication({ admin, id, req }) {
  const { application, decided, user } = await decide({ admin, id, to: 'approved', from: ['pending', 'rejected'], req });
  const promoted = user && await User.findOneAndUpdate({ _id: user._id, role: 'teacher_applicant' }, { $set: { role: 'teacher', teacherApprovedAt: new Date() } }, { new: true });
  if (!promoted) {
    // The account is no longer an applicant (it should not happen); put the decision back.
    await TeacherApplication.updateOne({ _id: id }, { $set: { status: application.status } });
    throw fail(409, 'The applicant account is no longer waiting for approval.', 'CONFLICT');
  }
  await revokeAllSessions(user._id);
  await audit({ action: 'teacher_application.approved', actor: admin, target: user, before: { status: application.status, role: 'teacher_applicant' }, after: { status: 'approved', role: 'teacher' }, req });
  if (emailFeaturesOn()) {
    await queueEmail({ kind: 'teacher-approved', userId: user._id, ref: `${id}-${decided.decisionSeq}`, extra: { applicationId: String(id), decisionSeq: decided.decisionSeq } });
  }
  return decided;
}

export async function rejectApplication({ admin, id, reason, req }) {
  const clean = reason ? cleanText(reason) : '';
  const { application, decided, user } = await decide({ admin, id, to: 'rejected', from: ['pending'], reason: clean, req });
  if (user) await revokeAllSessions(user._id);
  await audit({ action: 'teacher_application.rejected', actor: admin, target: user, before: { status: application.status }, after: { status: 'rejected' }, detail: clean || undefined, req });
  if (user && emailFeaturesOn()) {
    await queueEmail({ kind: 'teacher-rejected', userId: user._id, ref: `${id}-${decided.decisionSeq}`, extra: { applicationId: String(id), decisionSeq: decided.decisionSeq } });
  }
  return decided;
}
