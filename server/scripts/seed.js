import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Problem from '../models/Problem.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

/**
 * Seed a teacher, a student, and a couple of problems so the app is usable
 * immediately. Safe to re-run: it upserts the demo users.
 */
async function seed() {
  await connectDB();

  const demoUsers = [
    { name: 'Demo Teacher', email: 'teacher@demo.com', role: 'teacher', password: 'password123' },
    { name: 'Demo Student', email: 'student@demo.com', role: 'student', password: 'password123' },
  ];

  const created = {};
  for (const u of demoUsers) {
    const passwordHash = await User.hashPassword(u.password);
    const user = await User.findOneAndUpdate(
      { email: u.email },
      { name: u.name, email: u.email, role: u.role, passwordHash },
      { upsert: true, new: true }
    );
    created[u.role] = user;
    console.log(`Upserted ${u.role}: ${u.email} / ${u.password}`);
  }

  // --- Migrate legacy docs (old schema: single `language` + string starterCode)
  // to the new language-agnostic shape, and remove the duplicate per-language
  // "Two Sum" problems that are being merged into one. Operates on the raw
  // collection so we can read fields the current schema no longer defines.
  const coll = mongoose.connection.collection('problems');
  await coll.deleteMany({ title: { $in: ['Two Sum (Java)', 'Two Sum (C++)'] } });
  const legacy = await coll.find({ language: { $exists: true } }).toArray();
  for (const doc of legacy) {
    const starterCode = {};
    if (typeof doc.starterCode === 'string' && doc.starterCode && doc.language) {
      starterCode[doc.language] = doc.starterCode;
    }
    await coll.updateOne(
      { _id: doc._id },
      { $set: { starterCode }, $unset: { language: '' } }
    );
    console.log(`Migrated legacy problem: ${doc.title}`);
  }

  // --- Backfill the statement sections (input/output format, constraints,
  // sample examples) on problems created before they became mandatory. The
  // sample is derived from the problem's first test case so students see a real
  // worked example; the prose is a clearly-marked placeholder the teacher can
  // edit. Only missing fields are filled — nothing authored is overwritten.
  const needsBackfill = await coll
    .find({
      $or: [
        { inputFormat: { $in: [null, ''] } },
        { outputFormat: { $in: [null, ''] } },
        { constraints: { $in: [null, ''] } },
        { sampleCases: { $in: [null, []] } }, // also matches a missing field
      ],
    })
    .toArray();

  for (const doc of needsBackfill) {
    const firstCase = doc.testCases?.[0];
    const $set = {};
    if (!doc.inputFormat) {
      $set.inputFormat =
        'See the problem description above — the input is read from stdin. ' +
        '_(Teacher: please describe the exact input format.)_';
    }
    if (!doc.outputFormat) {
      $set.outputFormat =
        'Print the answer to stdout. ' +
        '_(Teacher: please describe the exact output format.)_';
    }
    if (!doc.constraints) {
      $set.constraints = 'Not specified yet.';
    }
    if (!doc.sampleCases?.length && firstCase) {
      $set.sampleCases = [
        {
          input: firstCase.input || '',
          output: firstCase.expectedOutput || '',
          explanation: '',
        },
      ];
    }
    if (Object.keys($set).length === 0) continue;
    await coll.updateOne({ _id: doc._id }, { $set });
    console.log(`Backfilled statement sections: ${doc.title}`);
  }

  const problems = [
    {
      title: 'Double the number',
      description: 'Read an integer from stdin and print it doubled.',
      inputFormat: 'A single line containing one integer `n`.',
      outputFormat: 'A single line containing `2 * n`.',
      constraints: '-10^9 <= n <= 10^9',
      sampleCases: [
        { input: '2', output: '4', explanation: '2 doubled is 4.' },
        { input: '-3', output: '-6', explanation: 'Negative inputs are doubled too.' },
      ],
      starterCode: {
        python: 'n = int(input())\n# print your answer\n',
        javascript:
          "const n = Number(require('fs').readFileSync(0, 'utf8').trim());\n// console.log your answer\n",
      },
      testCases: [
        { input: '2', expectedOutput: '4' },
        { input: '10', expectedOutput: '20' },
        { input: '-3', expectedOutput: '-6' },
      ],
      createdBy: created.teacher._id,
    },
    {
      title: 'Sum two numbers',
      description: 'Read two space-separated integers from stdin and print their sum.',
      inputFormat: 'A single line containing two space-separated integers `a` and `b`.',
      outputFormat: 'A single line containing `a + b`.',
      constraints: '-10^9 <= a, b <= 10^9',
      sampleCases: [
        { input: '2 3', output: '5', explanation: '2 + 3 = 5.' },
        { input: '100 -1', output: '99', explanation: '100 + (-1) = 99.' },
      ],
      starterCode: {
        javascript:
          "const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split(' ').map(Number);\n// console.log your answer\n",
        python: 'a, b = map(int, input().split())\n# print your answer\n',
      },
      testCases: [
        { input: '2 3', expectedOutput: '5' },
        { input: '100 -1', expectedOutput: '99' },
      ],
      createdBy: created.teacher._id,
    },
    {
      // The single, language-agnostic Two Sum (merged from the old Java/C++ pair).
      title: 'Two Sum',
      description:
        'Line 1: "n target". Line 2: n space-separated integers. Print the two ' +
        '0-based indices i j (i<j, space-separated) of the elements that sum to ' +
        'target. Exactly one solution is guaranteed.',
      inputFormat:
        'Line 1: two space-separated integers `n` and `target`.\n' +
        'Line 2: `n` space-separated integers — the array.',
      outputFormat:
        'A single line with the two 0-based indices `i j` (i < j, space-separated) ' +
        'of the elements that sum to `target`.',
      constraints:
        '2 <= n <= 10^4\n-10^9 <= a[i] <= 10^9\n-10^9 <= target <= 10^9\nExactly one valid answer exists.',
      sampleCases: [
        {
          input: '4 9\n2 7 11 15',
          output: '0 1',
          explanation: 'a[0] + a[1] = 2 + 7 = 9, so the indices are 0 and 1.',
        },
        {
          input: '3 6\n3 2 4',
          output: '1 2',
          explanation: 'a[1] + a[2] = 2 + 4 = 6.',
        },
      ],
      starterCode: {
        java: [
          'import java.util.*;',
          '',
          'public class Main {',
          '    public static void main(String[] args) {',
          '        Scanner sc = new Scanner(System.in);',
          '        int n = sc.nextInt();',
          '        int target = sc.nextInt();',
          '        int[] a = new int[n];',
          '        for (int i = 0; i < n; i++) a[i] = sc.nextInt();',
          '        // find indices i<j with a[i]+a[j]==target and print "i j"',
          '    }',
          '}',
          '',
        ].join('\n'),
        cpp: [
          '#include <bits/stdc++.h>',
          'using namespace std;',
          '',
          'int main() {',
          '    int n, target;',
          '    cin >> n >> target;',
          '    vector<int> a(n);',
          '    for (int i = 0; i < n; i++) cin >> a[i];',
          '    // find indices i<j with a[i]+a[j]==target and print "i j"',
          '    return 0;',
          '}',
          '',
        ].join('\n'),
        python: [
          'n, target = map(int, input().split())',
          'a = list(map(int, input().split()))',
          '# find indices i<j with a[i]+a[j]==target and print "i j"',
          '',
        ].join('\n'),
      },
      testCases: [
        { input: '4 9\n2 7 11 15', expectedOutput: '0 1' },
        { input: '3 6\n3 2 4', expectedOutput: '1 2' },
        { input: '2 6\n3 3', expectedOutput: '0 1' },
      ],
      createdBy: created.teacher._id,
    },
  ];

  for (const p of problems) {
    await Problem.findOneAndUpdate({ title: p.title }, p, { upsert: true });
    console.log(`Upserted problem: ${p.title}`);
  }

  await mongoose.disconnect();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
