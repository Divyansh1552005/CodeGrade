import { useCallback, useEffect, useRef, useState } from 'react';
import { Lightbulb, Lock, Send } from 'lucide-react';
import { api } from '../../api/client.js';
import Markdown from '../Markdown.jsx';
import { Badge, Button, EmptyState, ErrorState, Icon, Skeleton } from '../ui/index.js';
import { cn } from '../../lib/cn.js';

// Mirrors the server's limits so the form can stop an oversized message before sending it.
const MESSAGE_MAX = 500;
const CODE_MAX = 6000;
const MAX_LEVEL = 4;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const formatReset = (resetAt) => new Date(resetAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/** Counts down in whole seconds towards a moment in time. */
function useCountdown(until) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until || until <= Date.now()) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

function Message({ message }) {
  const mine = message.role === 'user';
  return (
    <li className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <span>{mine ? 'You' : 'Hint'}</span>
        {!mine && message.level && !message.fallback && <Badge>Level {message.level}</Badge>}
        {!mine && message.fallback && <Badge tone="warning">General hint</Badge>}
      </div>
      <div className={cn('max-w-xl rounded-lg border px-3 py-2', mine ? 'border-transparent bg-accent-subtle' : 'border-border bg-subtle')}>
        {mine ? <p className="whitespace-pre-wrap break-words text-base">{message.content}</p> : <Markdown>{message.content}</Markdown>}
      </div>
    </li>
  );
}

/**
 * Hint chat for one problem. Hints start as a nudge and get more specific; the server decides
 * the level and enforces every limit. The panel only reports what the server says is left.
 */
export default function HintChat({ problemId, code = '' }) {
  const [state, setState] = useState({ status: 'loading', thread: null, error: '' });
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const endRef = useRef(null);
  const secondsLeft = useCountdown(cooldownUntil);
  const url = `/problems/${problemId}/hints`;

  const load = useCallback(async () => {
    setState({ status: 'loading', thread: null, error: '' });
    try {
      const { data } = await api.get(url);
      setState({ status: 'ready', thread: data, error: '' });
      if (data.quota?.retryAfterSeconds > 0) setCooldownUntil(Date.now() + data.quota.retryAfterSeconds * 1000);
    } catch (err) {
      setState({ status: 'error', thread: null, error: err.response?.data?.error || 'Could not load your hints. Check your connection and try again.' });
    }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [state.thread?.messages?.length]);

  if (state.status === 'loading') {
    return <div role="status" aria-label="Loading hints" className="space-y-3 p-4"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-16 w-full" /><Skeleton className="h-9 w-full" /></div>;
  }
  if (state.status === 'error') return <div className="p-4"><ErrorState message={state.error} onRetry={load} /></div>;

  const { thread } = state;
  const { quota } = thread;
  const noMessages = quota.messagesLeft <= 0;
  const noQuestions = quota.questionsLeft <= 0 && !quota.questionCounted;
  const locked = noMessages || noQuestions;
  const cooling = secondsLeft > 0;
  const trimmed = draft.trim();

  const setQuota = (next, extra = {}) => setState((s) => ({ ...s, thread: { ...s.thread, quota: { ...s.thread.quota, ...next, ...extra } } }));

  async function send() {
    if (!trimmed || sending || cooling || locked) return;
    setSending(true);
    setNotice(null);
    try {
      const { data } = await api.post(url, { message: trimmed, code: String(code || '').slice(0, CODE_MAX) });
      setState((s) => ({ ...s, thread: { ...s.thread, messages: [...s.thread.messages, data.userMessage, data.reply], level: data.level, hintsUsed: data.hintsUsed, quota: data.quota } }));
      setDraft('');
      if (data.quota?.retryAfterSeconds > 0) setCooldownUntil(Date.now() + data.quota.retryAfterSeconds * 1000);
      if (data.fallback) {
        setNotice({ kind: 'info', text: data.refunded ? 'This was a general hint, so your message was not counted.' : 'This was a general hint. Your message was counted.' });
      }
    } catch (err) {
      const res = err.response;
      if (res?.status === 429) {
        const body = res.data || {};
        if (body.quota) setQuota(body.quota, body.limit === 'daily_questions' ? { questionCounted: false } : {});
        if (body.limit === 'rate') {
          setCooldownUntil(Date.now() + (body.retryAfterSeconds || 60) * 1000);
          setNotice({ kind: 'info', text: 'You can send two hint messages a minute. Your message is still here.' });
        }
      } else {
        if (res?.data?.quota) setQuota(res.data.quota);
        const base = res?.data?.error || 'Could not reach the hint service. Try again in a moment.';
        setNotice({ kind: 'error', text: res?.data?.refunded ? `${base} Your message was not counted.` : base });
      }
    } finally {
      setSending(false);
    }
  }

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-sm text-fg-muted">
        <span>Next hint: level {Math.min(thread.level, MAX_LEVEL)} of {MAX_LEVEL}</span>
        <span aria-live="polite">{plural(quota.messagesLeft, 'message')} left today, {plural(quota.questionsLeft, 'question')} left</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {thread.acceptedMode && <p className="mb-3 text-sm text-fg-muted">You solved this problem, so hints can now discuss other approaches.</p>}
        {thread.messages.length === 0 ? (
          <EmptyState icon={Lightbulb} title="Ask for a hint" description="Hints start as a nudge and get more specific each time. You will not get the full solution." />
        ) : (
          <ol role="log" aria-label="Hint conversation" className="space-y-4">
            {thread.messages.map((m) => <Message key={m.id} message={m} />)}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 space-y-2 border-t border-border p-3">
        {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={cn('text-sm', notice.kind === 'error' ? 'text-danger' : 'text-fg-muted')}>{notice.text}</p>}
        {locked ? (
          <div role="status" className="flex items-start gap-2 rounded-lg border border-border bg-subtle p-3 text-base">
            <Icon as={Lock} className="mt-0.5 text-fg-muted" />
            <p>
              {noMessages ? 'You have used all of today\'s hint messages.' : 'You have used both of today\'s hint questions, and this problem is not one of them.'}{' '}
              Hints reset on {formatReset(quota.resetAt)}, at midnight India time.
            </p>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-2">
            <label htmlFor={`hint-message-${problemId}`} className="sr-only">Message</label>
            <textarea
              id={`hint-message-${problemId}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={MESSAGE_MAX}
              rows={3}
              placeholder="Say what you tried and where you are stuck"
              className="min-h-20 w-full resize-none rounded-sm border border-border-strong bg-surface px-3 py-2 text-base text-fg placeholder:text-fg-subtle focus-visible:outline-offset-0"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm tabular-nums text-fg-muted">{draft.length}/{MESSAGE_MAX}</span>
              <Button type="submit" variant="primary" size="sm" loading={sending} disabled={!trimmed || cooling}>
                {cooling ? `Wait ${secondsLeft}s` : <><Icon as={Send} />Send</>}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
