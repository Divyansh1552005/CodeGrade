// Limits for teacher applications, each with an environment override. Read lazily.
function num(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function teacherAccess(env = process.env) {
  return {
    // Verified applications waiting for a decision. Past this, new teacher signups are refused.
    pendingCap: num(env, 'TEACHER_APPLICATION_CAP', 200),
    // New-application emails to the admin per hour. The queue badge still shows every application.
    adminNotifyPerHour: num(env, 'TEACHER_NOTIFY_PER_HOUR', 10),
    // Teacher signups from one IP per hour.
    signupsPerIpPerHour: num(env, 'TEACHER_SIGNUPS_PER_IP_PER_HOUR', 5),
  };
}
