import { CheckCircle2, CircleDashed, Clock, Loader2, XCircle } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Icon } from './Icon.jsx';

const tones = {
  neutral: 'border-border bg-subtle text-fg-muted',
  accent: 'border-transparent bg-accent-subtle text-accent-text',
  success: 'border-success-border bg-success-bg text-success',
  danger: 'border-danger-border bg-danger-bg text-danger',
  warning: 'border-warning-border bg-warning-bg text-warning',
  info: 'border-info-border bg-info-bg text-info',
};

export function Badge({ tone = 'neutral', icon, className, children }) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-medium', tones[tone], className)}>
      {icon && <Icon as={icon} className="size-3" />}
      {children}
    </span>
  );
}

const difficulty = { easy: 'success', medium: 'warning', hard: 'danger' };

export function DifficultyBadge({ level }) {
  const key = String(level || '').toLowerCase();
  return <Badge tone={difficulty[key] || 'neutral'}>{key ? key[0].toUpperCase() + key.slice(1) : 'Unknown'}</Badge>;
}

// Text always accompanies the color so status is never conveyed by color alone.
const statuses = {
  accepted: { tone: 'success', icon: CheckCircle2, label: 'Accepted' },
  graded: { tone: 'success', icon: CheckCircle2, label: 'Graded' },
  completed: { tone: 'success', icon: CheckCircle2, label: 'Completed' },
  approved: { tone: 'success', icon: CheckCircle2, label: 'Approved' },
  answered: { tone: 'success', icon: CheckCircle2, label: 'Answered' },
  wrong_answer: { tone: 'danger', icon: XCircle, label: 'Wrong answer' },
  runtime_error: { tone: 'danger', icon: XCircle, label: 'Runtime error' },
  compile_error: { tone: 'danger', icon: XCircle, label: 'Compilation error' },
  failed: { tone: 'danger', icon: XCircle, label: 'Failed' },
  error: { tone: 'danger', icon: XCircle, label: 'Error' },
  rejected: { tone: 'danger', icon: XCircle, label: 'Rejected' },
  time_limit: { tone: 'warning', icon: Clock, label: 'Time limit exceeded' },
  pending: { tone: 'warning', icon: Clock, label: 'Pending' },
  open: { tone: 'warning', icon: CircleDashed, label: 'Open' },
  queued: { tone: 'info', icon: CircleDashed, label: 'Queued' },
  running: { tone: 'info', icon: Loader2, label: 'Running' },
};

export function StatusBadge({ status }) {
  const key = String(status || '').toLowerCase();
  const match = statuses[key];
  if (!match) return <Badge>{key ? key[0].toUpperCase() + key.slice(1).replace(/_/g, ' ') : 'Unknown'}</Badge>;
  return <Badge tone={match.tone} icon={match.icon}>{match.label}</Badge>;
}
