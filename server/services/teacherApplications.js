import User from '../models/User.js';
import TeacherApplication from '../models/TeacherApplication.js';
import { teacherAccess } from '../config/teacherAccess.js';
import { emailFeaturesOn } from '../config/mail.js';
import { reservedEmail } from './adminConfig.js';
import { queueEmail } from './emailJob.js';
import { audit } from './audit.js';

/** True while there is room for another verified application waiting for a decision. */
export async function hasRoomForApplication() {
  const waiting = await TeacherApplication.countDocuments({ status: 'pending', visibleAt: { $exists: true } });
  return waiting < teacherAccess().pendingCap;
}

/** Record the application of a freshly created teacher_applicant. */
export async function createApplication(user, { organization, note }, { verified, req } = {}) {
  const application = await TeacherApplication.create({ userId: user._id, organization, note: note ?? '', ...(verified ? { visibleAt: new Date() } : {}) });
  await audit({ action: 'teacher_application.submitted', target: user, after: { status: 'pending' }, req });
  if (verified) await notifyAdmin(application);
  return application;
}

/** The applicant verified their email: from now on the admin can see the application. */
export async function markApplicationVisible(userId) {
  const application = await TeacherApplication.findOneAndUpdate(
    { userId, status: 'pending', visibleAt: { $exists: false } }, { $set: { visibleAt: new Date() } }, { new: true },
  );
  if (!application) return null;
  const user = await User.findById(userId);
  await audit({ action: 'teacher_application.verified', target: user, after: { status: 'pending' } });
  await notifyAdmin(application);
  return application;
}

// Emails the admin about a new application, at most TEACHER_NOTIFY_PER_HOUR an hour so a wave of signups
// cannot flood the inbox. Past the cap nothing is sent; the queue and its badge still show every application.
async function notifyAdmin(application) {
  if (!emailFeaturesOn()) return;
  const address = reservedEmail();
  if (!address) return;
  const admin = await User.findOne({ email: address, role: 'admin' });
  if (!admin) return;
  const recent = await TeacherApplication.countDocuments({ visibleAt: { $gt: new Date(Date.now() - 3600 * 1000) } });
  if (recent > teacherAccess().adminNotifyPerHour) return;
  await queueEmail({ kind: 'teacher-application', userId: admin._id, ref: String(application._id), extra: { applicationId: String(application._id) } });
}

/** What an applicant is told about their application. */
export async function applicationView(userId) {
  const application = await TeacherApplication.findOne({ userId }).lean();
  if (!application) return null;
  return {
    status: application.status, organization: application.organization, note: application.note,
    decisionReason: application.status === 'rejected' ? application.decisionReason ?? '' : undefined,
    submittedAt: application.createdAt, decidedAt: application.decidedAt,
  };
}
