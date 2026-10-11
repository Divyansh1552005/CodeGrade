# CodeGrade benchmark

Run from the repository root with the existing server and client dependencies installed. The benchmark harness and reports live here. The owner explicitly authorized the follow-up fixes listed in RESULTS.md.

## Commands

```sh
node server/scripts/bench/prepare.js
node server/scripts/bench/run.js
node server/scripts/bench/finalize.js
node server/scripts/bench/verify.js
```

Focused follow-up rechecks:

```sh
node server/scripts/bench/A.js A5
node server/scripts/bench/B.js B4
node server/scripts/bench/F.js F1
node server/scripts/bench/F.js F2
node server/scripts/bench/G.js G4
node server/scripts/bench/J.js J1
node server/scripts/bench/finalize.js
node server/scripts/bench/verify.js
```

B4 makes one real Judge0 request; its run is charged to the persistent provider budget ledger. For one section, use its script, for example `node server/scripts/bench/E.js`. For one test, pass the test ID, as in `node server/scripts/bench/E.js E2`. Use `node server/scripts/bench/run.js B` to start at B and continue sequentially through J. The corrective mode `node server/scripts/bench/run.js A --corrective` preserves D3b.

## Configuration and isolation

server/.env is read privately. REDIS_URL is needed for real limiter/queue checks. JUDGE0_API_KEY and optional JUDGE0_API_URL enable the bounded real sandbox subset. GROQ_API_KEY or GOOGLE_API_KEY enable the limited real-model subset; provider model names come from the existing model env variables. Real credentials are never printed. Missing or unreachable prerequisites are recorded.

MONGODB_URI is always replaced with a new temporary MongoDB URI. QUEUE_PREFIX and RATE_LIMIT_PREFIX are always a fresh bench UUID. Existing databases, queues, and limiter keys are not used. JWT secrets for each section are freshly generated. Most process-level API checks run development mode; D/E and query measurement use explicitly labelled test-memory limiting. G3 starts a separate production-mode API.

The mock Judge0 endpoint is local and never executes code. All worker LLM calls are injected mocks; only D3b uses a real model, with retries disabled. Real provider spending is recorded and bounded. Temporary MongoDB downloads use a pinned Ubuntu-compatible binary and the runtime cache on this Fedora host.

## Runtime and cleanup

Historical whole-section wall times in milliseconds:

| section | wallMs |
| --- | --- |
| A | 14008.604041 |
| B | 19571.045291000002 |
| C | 663604.3529640001 |
| D | 2411.70189 |
| E | 2894.903101 |
| F | 5431.853667 |
| G | 8509.382008 |
| H | 125165.40512099999 |
| I | 287749.264315 |
| J | 42471.408686999996 |

These are measured historical durations, not promised runtimes. Each section has an outer deadline when run through run.js. Individual waits are bounded. MongoDB startup, remote Redis latency, registration, retries, and cleanup affect runtime. Tests do not retry endlessly.

Ordinary cleanup stops only owned child processes, disconnects their clients, stops the temporary MongoDB, and scans/deletes only the unique Redis prefix. Interrupt handlers attempt the same cleanup. Abruptly killing the entire benchmark host can prevent cleanup; do not use FLUSHDB as a repair. Runtime contains reproducibility artifacts and the provider ledger, not application data.

## Reading the results

results.json is canonical. Each test records status, measurements or reason, exact rerun command, and earlier attempts when overwritten. RESULTS.md lists the baseline findings, authorized follow-up changes, rerun results, and candidate claims. TESTING_GUIDE.md teaches the method and its limits. Regenerate and verify documentation after targeted reruns so the guide never silently describes stale results.
