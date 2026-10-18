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

// A request in flight per problem. If the panel is unmounted and mounted again while the model is
// still working (for example the window crosses the desktop/mobile breakpoint), the new instance
// re-attaches to the same request instead of losing the reply.
const inFlight = new Map();

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

function Message({ message, animate }) {
  const mine = message.role === 'user';
  return (
    <li className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start', animate && 'message-in')}>
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

// Shown while the model works. The slower message appears after a few seconds so a long wait is explained.
const SLOW_AFTER_MS = 8000;
function Thinking({ slow }) {
  return (
    <div role="status" className="message-in mt-4 flex flex-col items-start gap-1">
      <span className="text-xs text-fg-muted">Hint</span>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-subtle px-3 py-2.5">
        <span aria-hidden="true" className="flex items-center gap-1"><span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" /></span>
        <span className="text-sm text-fg-muted">{slow ? 'Still thinking. This is taking longer than usual.' : 'Thinking about your question'}</span>
      </div>
    </div>
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
  const [pending, setPending] = useState(null); // the message being answered, shown right away
  const [slow, setSlow] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const loadedCount = useRef(0); // messages that were already there on load do not animate in
  const endRef = useRef(null);
  const secondsLeft = useCountdown(cooldownUntil);
  const url = `/problems/${problemId}/hints`;

  const setQuota = useCallback((next) => setState((s) => (
    s.thread ? { ...s, thread: { ...s.thread, quota: { ...s.thread.quota, ...next } } } : s
  )), []);

  // Applies the outcome of one send. Used for a new message and for re-attaching after a remount.
  const settle = useCallback(async (message, promise) => {
    setSending(true);
    setPending(message);
    try {
      const { data } = await promise;
      setState((s) => {
        if (!s.thread) return s;
        // The thread may already contain the exchange if it was reloaded after the server saved it.
        const have = new Set(s.thread.messages.map((m) => m.id));
        const added = [data.userMessage, data.reply].filter((m) => !have.has(m.id));
        return { ...s, thread: { ...s.thread, messages: [...s.thread.messages, ...added], level: data.level, hintsUsed: data.hintsUsed, quota: data.quota } };
      });
      if (data.quota?.retryAfterSeconds > 0) setCooldownUntil(Date.now() + data.quota.retryAfterSeconds * 1000);
      if (data.fallback) {
        setNotice({ kind: 'info', text: data.refunded ? 'This was a general hint, so your message was not counted.' : 'This was a general hint. Your message was counted.' });
      }
    } catch (err) {
      setDraft((current) => current || message); // the text goes back into the box
      const res = err.response;
      if (res?.status === 429) {
        const body = res.data || {};
        if (body.quota) setQuota(body.quota);
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
      setPending(null);
      setSending(false);
    }
  }, [setQuota]);

  const load = useCallback(async () => {
    setState({ status: 'loading', thread: null, error: '' });
    try {
      const { data } = await api.get(url);
      loadedCount.current = data.messages?.length ?? 0;
      setState({ status: 'ready', thread: data, error: '' });
      if (data.quota?.retryAfterSeconds > 0) setCooldownUntil(Date.now() + data.quota.retryAfterSeconds * 1000);
      const live = inFlight.get(problemId);
      if (live) settle(live.message, live.promise);
    } catch (err) {
      setState({ status: 'error', thread: null, error: err.response?.data?.error || 'Could not load your hints. Check your connection and try again.' });
    }
  }, [url, problemId, settle]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [state.thread?.messages?.length, pending]);
  useEffect(() => {
    if (!pending) { setSlow(false); return undefined; }
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  if (state.status === 'loading') {
    return <div role="status" aria-label="Loading hints" className="space-y-3 p-4"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-16 w-full" /><Skeleton className="h-9 w-full" /></div>;
  }
  if (state.status === 'error') return <div className="p-4"><ErrorState message={state.error} onRetry={load} /></div>;

  const { thread } = state;
  const { quota } = thread;
  const locked = quota.messagesLeft <= 0;
  const cooling = secondsLeft > 0;
  const trimmed = draft.trim();

  function send() {
    if (!trimmed || sending || cooling || locked) return;
    setNotice(null);
    // The message shows at once and the box clears, so the wait feels like a conversation.
    setDraft('');
    const promise = api.post(url, { message: trimmed, code: String(code || '').slice(0, CODE_MAX) });
    inFlight.set(problemId, { message: trimmed, promise });
    promise.then(() => {}, () => {}).finally(() => { if (inFlight.get(problemId)?.promise === promise) inFlight.delete(problemId); });
    settle(trimmed, promise);
  }

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-sm text-fg-muted">
        <span>Next hint: level {Math.min(thread.level, MAX_LEVEL)} of {MAX_LEVEL}</span>
        <span aria-live="polite">{plural(quota.messagesLeft, 'message')} left today</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {thread.acceptedMode && <p className="mb-3 text-sm text-fg-muted">You solved this problem, so hints can now discuss other approaches.</p>}
        {thread.messages.length === 0 && !pending ? (
          <EmptyState icon={Lightbulb} title="Ask for a hint" description="Hints start as a nudge and get more specific each time. You will not get the full solution." />
        ) : (
          <ol role="log" aria-label="Hint conversation" className="space-y-4">
            {thread.messages.map((m, i) => <Message key={m.id} message={m} animate={i >= loadedCount.current} />)}
            {pending && <Message key="pending" message={{ role: 'user', content: pending }} animate />}
          </ol>
        )}
        {pending && <Thinking slow={slow} />}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 space-y-2 border-t border-border p-3">
        {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={cn('text-sm', notice.kind === 'error' ? 'text-danger' : 'text-fg-muted')}>{notice.text}</p>}
        {locked ? (
          <div role="status" className="flex items-start gap-2 rounded-lg border border-border bg-subtle p-3 text-base">
            <Icon as={Lock} className="mt-0.5 text-fg-muted" />
            <p>
              You have used all of today's hint messages. Hints reset on {formatReset(quota.resetAt)}, at midnight India time.
            </p>
          </div>
        ) : (
          // Not a <form>: the workspace already wraps this panel in the solution's form, and a nested
          // form would submit the solution when Send is pressed.
          <div className="space-y-2">
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
              <Button type="button" variant="primary" size="sm" loading={sending} disabled={!trimmed || cooling} onClick={send}>
                {cooling ? `Wait ${secondsLeft}s` : <><Icon as={Send} />Send</>}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
