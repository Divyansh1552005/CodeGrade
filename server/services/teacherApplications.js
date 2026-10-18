import User from '../models/User.js';
import TeacherApplication from '../models/TeacherApplication.js';
import { teacherAccess } from '../config/teacherAccess.js';
import { audit } from './audit.js';

/** True while there is room for another verified application waiting for a decision. */
export async function hasRoomForApplication() {
  const waiting = await TeacherApplication.countDocuments({ status: 'pending', visibleAt: { $exists: true } });
  return waiting < teacherAccess().pendingCap;
}

/** Record the application of a freshly created teacher_applicant. */
export async function createApplication(user, { organization, note, degree, degreeLink, proofLinks }, { verified, req } = {}) {
  const application = await TeacherApplication.create({ userId: user._id, organization, note: note ?? '', degree: degree ?? '', degreeLink: degreeLink ?? '', proofLinks: proofLinks ?? [], ...(verified ? { visibleAt: new Date() } : {}) });
  await audit({ action: 'teacher_application.submitted', target: user, after: { status: 'pending' }, req });
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
  return application;
}

/** What an applicant is told about their application. */
export async function applicationView(userId) {
  const application = await TeacherApplication.findOne({ userId }).lean();
  if (!application) return null;
  return {
    status: application.status, organization: application.organization, note: application.note,
    degree: application.degree ?? '', degreeLink: application.degreeLink ?? '', proofLinks: application.proofLinks ?? [],
    decisionReason: application.status === 'rejected' ? application.decisionReason ?? '' : undefined,
    submittedAt: application.createdAt, decidedAt: application.decidedAt,
  };
}
