import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Check, Code2, FlaskConical, MessagesSquare, Play, TrendingUp } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { Button, Icon, PageSkeleton, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/index.js';

// A canned example, not a real run: it shows what a submission looks like before the visitor signs up.
const SAMPLES = [
  {
    id: 'python', label: 'Python',
    code: `def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i`,
  },
  {
    id: 'javascript', label: 'JavaScript',
    code: `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
}`,
  },
  {
    id: 'java', label: 'Java',
    code: `int[] twoSum(int[] nums, int target) {
    Map<Integer, Integer> seen = new HashMap<>();
    for (int i = 0; i < nums.length; i++) {
        if (seen.containsKey(target - nums[i])) return new int[]{seen.get(target - nums[i]), i};
        seen.put(nums[i], i);
    }
    return new int[0];
}`,
  },
  {
    id: 'cpp', label: 'C++',
    code: `vector<int> twoSum(vector<int>& nums, int target) {
    unordered_map<int, int> seen;
    for (int i = 0; i < nums.size(); i++) {
        if (seen.count(target - nums[i])) return {seen[target - nums[i]], i};
        seen[nums[i]] = i;
    }
    return {};
}`,
  },
];

const CASES = [
  { input: 'nums = [2, 7, 11, 15], target = 9', expected: '[0, 1]' },
  { input: 'nums = [3, 2, 4], target = 6', expected: '[1, 2]' },
  { input: 'nums = [3, 3], target = 6', expected: '[0, 1]' },
];

// Tries the sample: Run code shows the queued, running and accepted states a real submission goes through.
function Preview() {
  const [language, setLanguage] = useState(SAMPLES[0].id);
  const [phase, setPhase] = useState('idle'); // idle | running | done
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);

  function run() {
    clearTimeout(timer.current);
    setPhase('running');
    timer.current = setTimeout(() => setPhase('done'), 900);
  }
  function pick(next) {
    clearTimeout(timer.current);
    setLanguage(next);
    setPhase('idle');
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <Tabs value={language} onValueChange={pick}>
        <div className="flex items-center justify-between gap-2 border-b border-border pr-2">
          <TabsList className="border-b-0" aria-label="Language">
            {SAMPLES.map(({ id, label }) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}
          </TabsList>
          <Button size="sm" variant="primary" onClick={run} loading={phase === 'running'}>
            <Icon as={Play} />Run code
          </Button>
        </div>
        {SAMPLES.map(({ id, code }) => (
          <TabsContent key={id} value={id}>
            <pre className="overflow-x-auto bg-subtle p-4 text-sm leading-5 text-fg"><code>{code}</code></pre>
          </TabsContent>
        ))}
      </Tabs>
      <div className="border-t border-border p-4" aria-live="polite">
        {phase === 'idle' && <p className="text-sm text-fg-muted">Two Sum, sample problem. Press Run code to see how a result looks.</p>}
        {phase === 'running' && <StatusBadge status="running" />}
        {phase === 'done' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusBadge status="accepted" />
              <span className="text-sm text-fg-muted">3 of 3 test cases passed. Example result.</span>
            </div>
            <ul className="divide-y divide-border rounded-sm border border-border text-sm">
              {CASES.map(({ input, expected }) => (
                <li key={input} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
                  <code className="text-fg">{input}</code>
                  <span className="flex items-center gap-1.5 text-fg-muted"><Icon as={Check} className="text-success" />Output <code className="text-fg">{expected}</code></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: Code2,
    title: 'Solve problems in your language',
    body: 'Write solutions in an in-browser editor and submit them in Python, JavaScript, Java or C++. Every submission runs against the problem’s test cases.',
  },
  {
    icon: FlaskConical,
    title: 'See exactly what failed',
    body: 'You get a verdict, the input, expected output and actual output for every test case, and written AI feedback on your approach and complexity.',
  },
  {
    icon: MessagesSquare,
    title: 'Ask questions, get reviewed answers',
    body: 'Post a doubt and the AI drafts an answer. A teacher approves or rewrites it before you see it, so you are not left guessing whether it is right.',
  },
  {
    icon: TrendingUp,
    title: 'Track your progress',
    body: 'Earn XP and levels for solving problems, keep a daily streak, collect badges and see where you rank on the leaderboard.',
  },
];

const FOR_STUDENTS = [
  'Problems tagged by topic and difficulty, so you can pick what to practice next',
  'Feedback on every submission, not just pass or fail',
  'Answers to your doubts that a teacher has checked',
  'A dashboard that shows what to do next and how far you have come',
];

const FOR_TEACHERS = [
  'Create problems with a full statement, examples, test cases and starter code per language',
  'Import up to 100 problems at once from JSON, and export your problems and grading reports',
  'Review AI-drafted answers and approve, edit or reject them before students see them',
  'Write answers yourself when the AI cannot help',
];

function Checklist({ items }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-base">
          <Icon as={Check} className="mt-0.5 text-success" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function LandingPage() {
  const { isAuthed, loading } = useAuth();
  useEffect(() => { document.title = 'CodeGrade'; }, []);
  if (loading) return <PageSkeleton />;
  if (isAuthed) return <Navigate to="/dashboard" replace />;
  return (
    <div className="space-y-12 pb-8 sm:space-y-16">
      <section className="grid items-center gap-8 pt-2 sm:pt-10 lg:grid-cols-2 lg:gap-12">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Practice coding and get help when you are stuck</h1>
          <p className="mt-3 text-md text-fg-muted">
            CodeGrade grades your solutions automatically, explains what went wrong, and connects you with teachers who review every answer before you see it.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button variant="primary" size="lg" to="/register">Sign up</Button>
            <Button size="lg" to="/login">Log in</Button>
          </div>
          <p className="mt-6 text-sm text-fg-muted">Python, JavaScript, Java and C++. Try the example on this page.</p>
        </div>
        <Preview />
      </section>

      <section aria-labelledby="features-heading" className="border-t border-border pt-10">
        <h2 id="features-heading" className="text-lg font-semibold">What you can do</h2>
        <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {FEATURES.map(({ icon, title, body }) => (
            <div key={title} className="-mx-3 rounded-lg border border-transparent p-3 transition-colors hover:border-border hover:bg-surface">
              <h3 className="flex items-center gap-2 text-md font-semibold"><Icon as={icon} className="text-accent-text" />{title}</h3>
              <p className="mt-2 text-base text-fg-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="why-heading" className="border-t border-border pt-10">
        <h2 id="why-heading" className="text-lg font-semibold">Why join</h2>
        <div className="mt-6 grid gap-10 md:grid-cols-2">
          <div>
            <h3 className="mb-4 text-md font-semibold">If you are learning</h3>
            <Checklist items={FOR_STUDENTS} />
          </div>
          <div>
            <h3 className="mb-4 text-md font-semibold">If you are teaching</h3>
            <Checklist items={FOR_TEACHERS} />
          </div>
        </div>
      </section>

      <section aria-labelledby="start-heading" className="border-t border-border pt-10">
        <h2 id="start-heading" className="text-lg font-semibold">Get started</h2>
        <p className="mt-2 max-w-xl text-base text-fg-muted">Create an account as a student or a teacher. You choose your role when you sign up.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" size="lg" to="/register">Create an account</Button>
          <Button size="lg" to="/login">Log in</Button>
        </div>
      </section>
    </div>
  );
}
