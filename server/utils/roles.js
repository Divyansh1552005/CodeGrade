// Roles of the application. Only `student` and `teacher` use the product (problems, submissions, doubts).
// `teacher_applicant` has signed up as a teacher and waits for approval; `admin` manages accounts. Anything
// else, including a role that does not exist, is treated as having no access.
export const ROLES = Object.freeze({ STUDENT: 'student', TEACHER: 'teacher', ADMIN: 'admin', TEACHER_APPLICANT: 'teacher_applicant' });
export const ALL_ROLES = Object.freeze(Object.values(ROLES));
export const APP_ROLES = Object.freeze([ROLES.STUDENT, ROLES.TEACHER]);

/**
 * 'student' or 'teacher' for a signed-in user. Any other role throws a 403, so code that branches on the
 * kind of viewer can never fall into an "else treat as student" path for a role it does not know.
 */
export function viewerKind(user) {
  if (user?.role === ROLES.TEACHER) return 'teacher';
  if (user?.role === ROLES.STUDENT) return 'student';
  const err = new Error('Forbidden');
  err.status = 403;
  throw err;
}
