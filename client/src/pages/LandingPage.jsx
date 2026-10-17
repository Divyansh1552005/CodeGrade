import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Check, Code2, FlaskConical, MessagesSquare, TrendingUp } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { Badge, Button, Icon, PageSkeleton } from '../components/ui/index.js';

const LANGUAGES = ['Python', 'JavaScript', 'Java', 'C++'];

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
      <section className="max-w-2xl pt-2 sm:pt-10">
        <h1 className="text-xl font-semibold sm:text-2xl">Practice coding and get help when you are stuck</h1>
        <p className="mt-3 text-md text-fg-muted">
          CodeGrade grades your solutions automatically, explains what went wrong, and connects you with teachers who review every answer before you see it.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button variant="primary" size="lg" to="/register">Sign up</Button>
          <Button size="lg" to="/login">Log in</Button>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          <span>Languages</span>
          {LANGUAGES.map((name) => <Badge key={name}>{name}</Badge>)}
        </div>
      </section>

      <section aria-labelledby="features-heading" className="border-t border-border pt-10">
        <h2 id="features-heading" className="text-lg font-semibold">What you can do</h2>
        <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {FEATURES.map(({ icon, title, body }) => (
            <div key={title}>
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
