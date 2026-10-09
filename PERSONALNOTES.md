# CodeGrade — Personal Notes

Plain-English companion to [README.md](README.md) and
[ARCHITECTURE.md](ARCHITECTURE.md). This walkthrough was reconstructed after an
accidental documentation overwrite; it describes the current implementation.
The original personal wording could not be recovered. All three documents are
now trackable in Git so future edits can be reviewed and recovered.

## Part 1 — The 30-second overview

Students solve coding problems and ask doubts. Teachers create problems and
review answers. Judge0 runs submitted code in a sandbox; AI supplies feedback
and draft answers. Teachers control approval. MongoDB stores application data,
Redis stores queues and rate-limit counters, and a separate worker handles slow
work. React presents the results and polls while work is pending.

The important boundary: the API saves an accepted request quickly. A worker
later completes it. A successful HTTP response accepting work does not mean
that grading or AI generation has finished.

## Part 2 — Vocabulary

| Term | Meaning here |
|---|---|
| Route | An HTTP endpoint such as POST /submissions |
| Middleware | A check run before the route: authentication, role, validation or rate limit |
| Model | Mongoose's definition of a MongoDB document |
| JWT | Signed authentication token |
| Judge0 | External sandbox service that executes code |
| LangChain | Library connecting our prompts and output schemas to the AI provider |
| BullMQ | Library managing Redis queues and workers |
| Outbox | MongoDB record of work that must eventually be dispatched |
| Idempotency | Replaying work does not duplicate its saved effect |
| Polling | Periodically fetching a resource until its status changes |
| TTL | Database expiry mechanism used for refresh-token records |

## Part 3 — Follow one submission

1. The student opens a problem and writes code in the editor.
2. The browser sends the problem ID, language and code to POST /submissions.
3. Middleware checks identity, student role, quota and request shape.
4. The route saves a queued Submission, including a private snapshot of the
   test cases, then creates a durable grading WorkItem.
5. The response is 202 with the submission ID. The browser starts polling.
6. The worker dispatches and consumes the job, runs Judge0, compares outputs,
   and saves test results. The submission becomes graded or error.
7. Separate jobs produce AI feedback and project completion into progress,
   achievements. AI failure does not erase test results.
8. The browser keeps checking pending feedback, then stops at a terminal state.

The snapshot prevents a teacher's later test-case edit from changing an already
accepted submission. It is private and must never be included in student APIs.
An empty test-result array is not treated as a successful solve.

## Part 4 — Follow one doubt

The student posts a title and body. The API saves the doubt and draft-generation
work, returning while the draft is pending. The worker asks AI for content and
saves an Answer awaiting teacher review. Student views hide unapproved answers.
The teacher can approve, reject or answer manually. Approval creates a durable
notification event for the student.

AI produces content only. It cannot choose an approval state or grant a role.
The Answer model enforces allowed transitions. A slow or failing draft job must
preserve a teacher answer created while the AI request was running. Off-topic
classification and provider failures have distinct outcomes.

## Part 5 — Backend file tour

| File or directory | What to look here for |
|---|---|
| server/server.js | Environment loading, Mongo connection, indexes and HTTP startup |
| server/app.js | Express middleware, CORS, routes and error handling |
| server/worker.js | Queue consumers, dispatch, recovery and shutdown |
| server/config/db.js | MongoDB connection |
| server/config/redis.js | Shared Redis configuration |
| server/routes/auth.js | Register, login, refresh and logout |
| server/routes/problems.js | Problem browsing and teacher changes |
| server/routes/submissions.js | Accept work and read authorized submissions |
| server/routes/doubts.js | Doubt creation and browsing |
| server/routes/answers.js | Teacher answer creation and approval decisions |
| server/routes/activity.js | Progress, leaderboard and notifications |
| server/routes/jobs.js | Teacher imports, exports and reports |
| server/middleware/auth.js | Access-token verification |
| server/middleware/roleGuard.js | Role checks |
| server/middleware/validate.js | Zod request validation |
| server/middleware/rateLimit.js | Redis quotas with memory insurance |
| server/middleware/errorHandler.js | Consistent error responses |
| server/validation/schemas.js | Accepted request fields and constraints |
| server/services/tokenService.js | Token creation, refresh rotation and revocation |
| server/services/judge0Client.js | Judge0 requests and result polling |
| server/services/gradingService.js | Test execution and result comparison |
| server/services/languageMap.js | Supported languages and Judge0 IDs |
| server/services/llm.js | AI provider configuration |
| server/services/aiFeedbackChain.js | Structured code-feedback prompt and output |
| server/services/doubtDraftChain.js | Draft-answer prompt and output |
| server/utils/cookies.js | Refresh-cookie settings |
| server/utils/sanitize.js | Input/context handling helpers |
| server/utils/pagination.js | Pagination helpers |
| server/constants/topics.js | Backend topic choices |
| server/scripts | Manual seed/cleanup tools and isolated live smoke testing |
| server/tests | Unit, integration, authorization and security checks |

Background-processing files are explained individually in Part 10.

Mongo models have distinct responsibilities: User stores identity and role;
RefreshToken stores session rotation/revocation state; Problem stores a teacher's
statement, languages and test cases; Submission stores code and grading state;
Doubt stores the student's question and draft status; Answer stores content and
review state. WorkItem, StudentStats and Notification support the new worker flow.

## Part 6 — Frontend file tour

| File or directory | Purpose |
|---|---|
| client/src/main.jsx | React entry point |
| client/src/router.jsx | Page routes and lazy loading |
| client/src/layouts/RootLayout.jsx | Shared application layout |
| client/src/auth/AuthContext.jsx | Session restoration, login and logout |
| client/src/api/client.js | Axios requests and shared refresh-on-401 flow |
| client/src/api/useCachedQuery.js | Cached fetching, optional polling and stale-response protection |
| client/src/api/usePaginatedQuery.js | Paged list fetching |
| client/src/theme/ThemeContext.jsx | Theme choice |
| client/src/styles.css | Global styles and theme tokens |
| client/src/data/topics.js | Frontend topic choices |
| client/src/data/starterTemplates.js | Initial editor code |
| client/src/pages/LandingPage.jsx | Public introduction |
| client/src/pages/Login.jsx and Register.jsx | Authentication forms |
| client/src/pages/Dashboard.jsx | Role-specific actions and activity |
| client/src/pages/ProblemList.jsx | Problem browsing |
| client/src/pages/CreateProblem.jsx | Teacher problem form |
| client/src/pages/SubmitCode.jsx | Editor, queued grading, feedback and history |
| client/src/pages/AskDoubt.jsx | Question form |
| client/src/pages/DoubtBoard.jsx | Doubt listing |
| client/src/pages/DoubtDetail.jsx | Question and visible answers |
| client/src/pages/TeacherReview.jsx | Teacher review of AI drafts |
| client/src/pages/Profile.jsx | User activity and solved problems |
| client/src/pages/BulkJobs.jsx | Teacher background jobs and downloads |
| client/src/components/ActivityPanel.jsx | XP, streaks, achievements, ranking and alerts |

Reusable components include ProtectedRoute and NavBar for navigation; CodeEditor
for Monaco; ProblemStatement and Markdown for content; MarkdownEditor for input;
TopicFilter/TopicSelect for tags; Modal/ConfirmDialog for interactions; and
LoadingSpinner, ColdStartNotice, AuthCard and FormMotion for loading/form presentation.

Authentication changes invalidate cached private data. Polling avoids overlapping
requests and ignores responses from old keys or unmounted pages. Submission
status uses a short interval; the dashboard and job lists use slower refreshes.
SSE is a future option, not part of the current implementation.

## Part 7 — Authentication and security

The short-lived access JWT is held in browser memory. The refresh JWT is in an
httpOnly cookie. The server stores a hash of its token identifier, rotates refresh
tokens on use, and revokes active sessions if a revoked token is reused.
Concurrent unauthorized requests share one refresh attempt in the Axios client.

Role checks and ownership checks serve different purposes: being a teacher does
not grant access to another teacher's bulk jobs, and students cannot read another
student's submissions or notifications. Validation rejects unsupported request
shapes before work is accepted. Rate limits are enforced in the API before queueing.

Student code executes through Judge0, not in the API or worker process. AI prompts
and output validation constrain content, while application code owns privileged
fields and approval state. Provider calls have timeouts. CORS and refresh-cookie
settings must match the actual deployment origins; see README deployment steps.
Never commit .env files or print provider credentials into test output.

## Part 8 — Running and deploying

Configure server/.env and client/.env using the documented examples in README.
Use separate terminals:

```sh
# Backend API, from server/
npm run dev
# Background consumers, from server/
npm run worker
# Frontend, from client/
npm run dev
```

The API and worker need the same MongoDB, Redis and queue prefix. The worker also
needs Judge0 and AI credentials. Production requires an independently running
worker service alongside the API; a frontend deployment cannot run it for you.
Do not use different queue prefixes for workers sharing the same domain database.

## Part 9 — Testing and maintenance

```sh
# From server/
npm test
npm run test:smoke
# From client/
npm run test:frontend
npm run build
```

The normal test suites mock external providers. The live smoke script uses real
Redis, Judge0 and AI with temporary MongoDB and isolated Redis keys. It consumes
provider requests and cleans up its own resources. It does not test every screen
through a real browser. Component tests cover the key polling and job interactions.

When changing a lifecycle, check both normal and retry paths. Do not remove unique
keys, reset completed work, expose hidden tests or make AI approval automatic.
When adding a queued action, add its durable record, processor, recovery path,
owner checks, terminal failure behavior and status UI. Update all three docs.

## Part 10 — Background jobs, one by one

### Why there is a separate worker now

The API accepts a request and saves work; the worker performs slow or retryable
work. Start both: `cd server`, then `npm run dev` in one terminal and
`npm run worker` in another. Both use `server/.env` and the same MongoDB and Redis.
The worker additionally needs valid Judge0 and AI credentials. Deployment also
needs a separate worker service; deploying the API alone leaves jobs pending.

A **queue** is a waiting list of work. **BullMQ** is the npm library managing that
list in the Redis service we already had. A **WorkItem** is the durable MongoDB
record of what should happen. Keeping that record first is called an **outbox**:
if Redis disappears, the to-do list is still in MongoDB. The worker checks up to
100 pending records every two seconds. An accepted request can sit pending while
Redis is unavailable, but it cannot actually finish until Redis is fixed.

### The implemented jobs

1. **Grading**: run Judge0 against the saved original test cases. Later problem
   edits do not change a previously accepted submission. Results are saved first.
2. **Doubt drafting**: ask the AI for an answer, save it as pending teacher review.
   The model never decides whether an answer is approved.
3. **Feedback**: a separate AI job comments on graded code. It has its own
   pending/running/completed/failed status; test results remain usable during
   AI retries. The UI keeps checking until feedback finishes or fails.
4. **Completion and analytics**: rebuild the student's graded-submission count,
   test totals and unique solved problems. Separate UserStats records hold XP and streaks. Rebuilding means
   counting saved truth, so replaying a job cannot add extra points.
5. **Gamification**: easy/medium/hard first solves earn 100/200/300 XP.
   Repeats earn no XP but successful solves still maintain a UTC streak.
   The worker's first award date counts; failures do not. Levels use a quadratic
   threshold curve. Catalog rules unlock first/five/ten solves, seven-day streak
   and level five badges. UserStats and unique UserBadge records own this data.
6. **Notifications**: approved-answer alerts appear on the
   dashboard. They are in-app messages, not emails. Each has a unique event
   key, so retries do not create repeated alerts or reset a read marker. Only
   the recipient can list/mark their notifications; the latest 30 are shown.
7. **Bulk imports and exports**: teachers open Dashboard → Imports & Reports.
   Paste a JSON array or `{ "problems": [...] }`. All rows must match the
   create-problem form; the whole batch is validated before queueing. Limit:
   100 rows / 1 MB request. Each row has a job-and-row key, so a retry doesn't
   duplicate it. Imports add new problems; partially saved rows stay saved if
   the job finally fails. Exports include only your own problems, including
   archived ones. Reports give total/graded/error/all-passed submission counts
   for those problems. Download results as JSON. Export caps: 1000 problems
   and 8 MB. The API accepts up to three active jobs per teacher using a
   best-effort count check, not a global atomic quota.
8. **Recovery**: at startup and roughly every minute, inspect the Mongo to-do
   list and domain records. Restore missing events and Redis jobs. Check queue
   state first: an old job that is still active should stay active, not get a
   second worker. Failed jobs stay failed after three attempts; recovery does
   not restart their budget forever. Historical grades are backfilled into
   progress the first time recovery runs.

### New files and their jobs

| File | Purpose |
|---|---|
| `server/models/WorkItem.js` | Durable to-do records with status, attempts, payload and result |
| `server/models/StudentStats.js` | Saved progress/analytics snapshot per student |
| `server/models/Notification.js` | Deduplicated in-app alerts and read markers |
| `server/services/workService.js` | Creates events with unique keys; records follow-up work |
| `server/services/submissionQueue.js` | Creates a durable grading WorkItem |
| `server/services/submissionProcessor.js` | Runs grading and separately runs feedback |
| `server/services/doubtProcessor.js` | Draft creation with replay safety and teacher-answer preservation |
| `server/services/progressService.js` | Rebuilds analytics, XP, streaks and achievements |
| `server/services/notificationProcessor.js` | Creates grading/answer notifications |
| `server/services/bulkProcessor.js` | Idempotent imports and owner-scoped exports/reports |
| `server/services/workProcessor.js` | Common status handling, attempt tracking and final failure propagation |
| `server/services/recoveryService.js` | Repairs missing work and dispatches pending records |
| `server/services/queueRuntime.js` | Queue names, Redis connection and bounded error logging |
| `server/worker.js` | Starts consumers, dispatcher and the recurring recovery scheduler |
| `server/routes/activity.js` | Own progress, leaderboard, notifications and mark-read APIs |
| `server/routes/jobs.js` | Teacher bulk-job creation, owner history and result APIs |
| `client/src/components/ActivityPanel.jsx` | Dashboard progress, achievements, leaderboard and notifications |
| `client/src/pages/BulkJobs.jsx` | Teacher import/export/report controls and job polling |
| `server/tests/integration/backgroundJobs.test.js` | Recovery, retries, idempotency and ownership regression checks |

Existing models gained a private submission test-case snapshot, separate feedback
status/error, completion markers, draft error, an AI-generation key and an import
key. API/worker startup waits for important unique indexes. Approval stays in the
request handler and records a notification event after saving the decision.
`useCachedQuery` gained optional polling, overlap protection and stale-response
protection. Auth changes clear cached private data; pending feedback/history,
doubt detail, teacher review, progress and notifications now refresh automatically.

### APIs you can use

- `POST /submissions`: 202 with submission ID; `GET /submissions/:id` shows status/results.
- `POST /doubts`: 201 with pending draft status; existing detail endpoints refresh it.
- `GET /activity/progress`: your analytics, XP, achievements and streaks.
- `GET /activity/leaderboard`: top 20 names and scores.
- `GET /activity/notifications`: your newest messages.
- `PATCH /activity/notifications/:id/read`: mark your message read.
- `POST /jobs`: teacher-only body `{ type: "problem-import", problems: [...] }`,
  `{ type: "problem-export" }`, or `{ type: "report-export" }`; returns 202.
- `GET /jobs` and `GET /jobs/:id`: your own teacher job history/status/results.

### What failure means now

If Redis reports `getaddrinfo ENOTFOUND`, the configured hostname cannot be
resolved. Get the current connection URL from the provider dashboard and replace
`REDIS_URL` in `server/.env`. Restart the API and worker. MongoDB connecting does
not mean Redis connected. The `punycode` warning is unrelated. The worker keeps
retrying Redis and reduces repeated identical connection logs to every 30 seconds.

Jobs get three attempts with delays starting at five seconds and increasing.
After exhaustion, grading becomes error, feedback failed, or doubt drafting
failed. Students may resubmit failed grading; teachers can answer failed doubts
manually. An off-topic doubt is a completed classification, not a retryable outage.

MongoDB document writes and outbox writes are separate operations. Recovery
repairs known gaps, but an API response can still fail after a document was saved.
Jobs are delivered at least once: an external Judge0/AI request may repeat after
a crash. Unique keys and rebuilding stats protect database outcomes from duplicate
work. Completed WorkItems/export results currently remain in MongoDB without
automatic cleanup; an archive policy is future work. Stats rebuild scans the
student's graded history, so larger deployments may need an incremental design.
Normal login/auth, rate-limit decisions, ordinary edits and approvals remain in
the API. MongoDB already deletes expired refresh tokens via TTL. Manual seed and
cleanup scripts are not turned into automatic destructive jobs.

### How to verify it

Backend tests use temporary MongoDB, fake queue transport and mocked AI/Judge0.
They explicitly run queued processors: no live Redis is needed. They check that
requests return before AI execution, retries preserve teacher answers, imports
and notifications deduplicate, XP does not double, snapshots survive problem
edits, recovery does not duplicate active jobs, and job/notification ownership
is enforced. Frontend tests check polling and teacher-job controls; `npm run build`
checks that the new pages compile. The separate live smoke check was also run successfully with real providers.

## Part 11 — Phase 1 verification (10 October 2026)

- Backend: 113 tests passed across 13 suites.
- Frontend: 11 tests passed across four test files.
- Production frontend build: passed.
- Live smoke: all eight checks passed using real Redis, Judge0 and AI.
- Live checks covered queued acceptance, grading, feedback, progress and alerts,
  draft approval visibility, teacher bulk jobs, restart recovery, and authorization
  with the real Redis-backed submission limit.

The latest live report is `/tmp/codegrade-smoke-results.json`. Optional
`QUEUE_PREFIX` and `RATE_LIMIT_PREFIX` isolate smoke queues and quota counters;
normal queues default to the BullMQ prefix `bull`.

Redis connectivity is fixed and verified. Its observed eviction policy is still
`volatile-lru`. Set the provider's policy to `noeviction` before production so
queue keys cannot be evicted. The tests did not change global Redis configuration.
See [BullMQ production guidance](https://docs.bullmq.io/guide/going-to-production).

## Part 12 — Phase 2: the gamification layer

Think of grading as deciding whether the code passes, and gamification as deciding
what that success earns. The completion worker calls `awardSubmission`, which
saves an immutable GamificationEvent before rebuilding UserStats. A retry uses
the same event and date, so it cannot pay twice. A different successful submission
on an already solved problem keeps the streak alive without granting extra XP.

The problem's difficulty and topics are copied onto new submissions when accepted.
That makes the promised reward stable while the queue runs. Easy earns 100 XP,
medium 200 and hard 300. Level 1 starts at zero, level 2 at 100, level 3 at 400,
level 4 at 900 and level 5 at 1600. The XP bar shows progress within the current
level, not a percentage of lifetime XP.

UTC award days drive streaks. Yesterday means add one, today means keep the same
count, and a missed day means start again at one. Only successful nonempty-test
submissions count. The dashboard reports a stale streak as zero. Old submissions
are backfilled at their first worker award time, not their original submission
date; old records without snapshots use the current problem's metadata.

Badges are their own small rules engine. Badge stores a metric and threshold;
UserBadge stores who earned it. `checkBadges(userId, event)` checks the saved stats
after each successful event. Rules cover one/five/ten solves, seven days and level
five. Unique indexes mean concurrent workers cannot give the same badge twice.
StudentStats now keeps submission/test analytics only; UserStats owns game scores.

The mini-leaderboard can show global or a topic. `/leaderboard?scope=global` ranks
total XP; `/leaderboard?scope=topic&topic=Arrays` ranks Arrays XP. A multi-topic
solve gives its full XP to each topic, while global XP is awarded only once.
Names and scores are public to logged-in users; emails are excluded. Results are
cached for 30 seconds in each API process. Weekly reset/time decay is future work.

The worker registers an hourly difficulty job on the existing maintenance queue
and recalculates at startup. It takes the latest graded, nonempty attempt per
student/problem: at least ten students must have attempted it before the label
changes. >=70% pass rate is easy, >=30% medium, below that hard. Smaller samples
keep the teacher's initial choice. Infrastructure failures are excluded. Difficulty
changes never rewrite XP already awarded.

The dashboard now has a streak flame, level/XP bar, badge shelf and scope-selectable
ranking. Teachers can choose initial difficulty in the form; students see current
difficulty and the first-solve XP on problems. Existing polling handles updates.

New files: `UserStats.js`, `Badge.js`, `UserBadge.js`, `GamificationEvent.js`,
`gamificationService.js`, `badgeService.js`, `leaderboardService.js`,
`difficultyService.js`, and `routes/leaderboard.js`. Completion, recovery and worker
startup integrate them. `gamification.test.js` exercises actual temporary MongoDB;
`ActivityPanel.test.jsx` checks the widgets. The final Phase 2 test result is recorded after validation below.

Grading-complete notifications have been removed. Polling still updates grading
results and progress. Already queued grading-alert jobs do nothing, and existing
saved grading alerts are hidden. Approved-answer alerts still work normally.

### Phase 2 final verification — 10 October 2026

- 126 backend tests passed across 14 suites.
- 14 frontend tests passed across five files; production build passed.
- Nine isolated live checks passed against real Redis, Judge0 and AI.
- Live grading awarded medium XP (200), projected level/badges/topic rankings,
  and produced no grading notification. Approved-answer alerts still passed.
- The live difficulty job changed the displayed difficulty while earned XP stayed
  unchanged. Restart recovery, ownership and Redis quotas also passed.
- `git diff --check` passed. Redis still reports volatile-lru; production requires
  noeviction as already documented. Global Redis configuration was not changed.
