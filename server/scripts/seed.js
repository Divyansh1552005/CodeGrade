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
        { topics: { $in: [null, []] } },
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
    if (!doc.topics?.length) {
      // Unclassified until a teacher re-tags it — a safe, always-valid default.
      $set.topics = ['General Doubt'];
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
      topics: ['Math'],
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
      topics: ['Math'],
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
      topics: ['Arrays', 'Hashing'],
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
    {
      // Created via the UI before topics existed; upserting here both fixes
      // its topics (was defaulted to 'General Doubt' by the backfill) and
      // replaces its placeholder input/output format text with real prose.
      title: 'Palindrome Check',
      description:
        'Given a string, determine whether it is a palindrome (reads the same ' +
        'forwards and backwards), ignoring case. Read the string from stdin ' +
        '(single line). Print "true" if it is a palindrome, otherwise print "false".',
      topics: ['Strings'],
      inputFormat: 'A single line containing a string `s` (letters only, case-insensitive).',
      outputFormat: '`true` if `s` is a palindrome (ignoring case), otherwise `false`.',
      constraints: '1 <= length of s <= 1000',
      sampleCases: [
        { input: 'madam', output: 'true', explanation: '"madam" reads the same backwards.' },
        { input: 'expect', output: 'false', explanation: '"expect" is not a palindrome.' },
      ],
      starterCode: {
        python: 's = input().strip()\n# your logic here',
      },
      testCases: [
        { input: 'madam', expectedOutput: 'true' },
        { input: 'nitin', expectedOutput: 'true' },
        { input: 'expect', expectedOutput: 'false' },
        { input: 'awein', expectedOutput: 'false' },
      ],
      createdBy: created.teacher._id,
    },
    {
      title: 'Maximum Element in an Array',
      description:
        'Given an array of N integers, find and print the maximum element in the array.\n\n' +
        'The first line contains an integer N.\nThe second line contains N space-separated integers.',
      topics: ['Arrays'],
      inputFormat: 'Line 1: an integer `N`. Line 2: `N` space-separated integers.',
      outputFormat: 'A single integer — the maximum value in the array.',
      constraints: '1 <= N <= 10^5\n-10^9 <= a[i] <= 10^9',
      sampleCases: [
        { input: '5\n3 8 2 10 6', output: '10', explanation: '10 is the largest value.' },
      ],
      starterCode: {
        javascript:
          "const data = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/);\n// parse input from data and console.log your answer\n",
        python: 'import sys\n\ndata = sys.stdin.read().split()\n# parse input from data and print your answer\n',
        java:
          'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // read input with sc.nextInt()/sc.next() and print your answer\n    }\n}\n',
        cpp:
          '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // read input with cin and print your answer with cout\n    return 0;\n}\n',
      },
      testCases: [
        { input: '5\n7 7 7 7 7', expectedOutput: '7' },
        { input: '5\n3 8 2 10 6', expectedOutput: '10' },
      ],
      createdBy: created.teacher._id,
    },
    {
      title: 'Fibonacci Number',
      description: 'Given n, print the n-th Fibonacci number, with F(0) = 0 and F(1) = 1.',
      topics: ['Dynamic Programming', 'Recursion'],
      inputFormat: 'A single line containing one integer `n`.',
      outputFormat: 'A single line containing `F(n)`.',
      constraints: '0 <= n <= 40',
      sampleCases: [
        { input: '5', output: '5', explanation: 'F: 0, 1, 1, 2, 3, 5 -> F(5) = 5.' },
        { input: '10', output: '55', explanation: 'F(10) = 55.' },
      ],
      starterCode: {
        python: 'n = int(input())\n# print F(n)\n',
      },
      testCases: [
        { input: '0', expectedOutput: '0' },
        { input: '1', expectedOutput: '1' },
        { input: '5', expectedOutput: '5' },
        { input: '10', expectedOutput: '55' },
      ],
      createdBy: created.teacher._id,
    },
    {
      title: 'Binary Search',
      description:
        'Given a sorted (ascending) array and a target value, print the 0-based index ' +
        'of the target, or -1 if it is not present.',
      topics: ['Searching', 'Arrays'],
      inputFormat:
        'Line 1: an integer `n`. Line 2: `n` space-separated, ascending integers. ' +
        'Line 3: the integer `target`.',
      outputFormat: 'The 0-based index of `target` in the array, or `-1` if absent.',
      constraints: '1 <= n <= 10^5\nThe array is sorted in ascending order.',
      sampleCases: [
        {
          input: '5\n1 3 5 7 9\n7',
          output: '3',
          explanation: '7 is at index 3.',
        },
        {
          input: '4\n2 4 6 8\n5',
          output: '-1',
          explanation: '5 is not present in the array.',
        },
      ],
      testCases: [
        { input: '5\n1 3 5 7 9\n7', expectedOutput: '3' },
        { input: '4\n2 4 6 8\n5', expectedOutput: '-1' },
        { input: '1\n5\n5', expectedOutput: '0' },
      ],
      createdBy: created.teacher._id,
    },
    {
      title: 'Valid Parentheses',
      description:
        'Given a string containing only the characters ()[]{} , determine whether the ' +
        'brackets are balanced and correctly nested. Print "true" or "false".',
      topics: ['Stacks & Queues', 'Strings'],
      inputFormat: 'A single line containing a string `s` of bracket characters.',
      outputFormat: '`true` if `s` is balanced and correctly nested, otherwise `false`.',
      constraints: '1 <= length of s <= 10^4',
      sampleCases: [
        { input: '()[]{}', output: 'true', explanation: 'Every bracket is closed in order.' },
        { input: '(]', output: 'false', explanation: '"(" is closed by the wrong bracket type.' },
      ],
      testCases: [
        { input: '()[]{}', expectedOutput: 'true' },
        { input: '(]', expectedOutput: 'false' },
        { input: '{[]}', expectedOutput: 'true' },
        { input: '(', expectedOutput: 'false' },
      ],
      createdBy: created.teacher._id,
    },
    {
      title: 'Count Set Bits',
      description: 'Given a non-negative integer n, print the number of 1 bits in its binary representation.',
      topics: ['Bit Manipulation', 'Math'],
      inputFormat: 'A single line containing one non-negative integer `n`.',
      outputFormat: 'A single integer — the number of set (1) bits in `n`.',
      constraints: '0 <= n <= 10^9',
      sampleCases: [
        { input: '5', output: '2', explanation: '5 is 101 in binary — two 1 bits.' },
        { input: '7', output: '3', explanation: '7 is 111 in binary — three 1 bits.' },
      ],
      testCases: [
        { input: '0', expectedOutput: '0' },
        { input: '5', expectedOutput: '2' },
        { input: '7', expectedOutput: '3' },
        { input: '1024', expectedOutput: '1' },
      ],
      createdBy: created.teacher._id,
    },
    {
      title: 'Count Islands',
      description:
        'Given a grid of 0s and 1s, count the number of islands — groups of 1s ' +
        'connected horizontally or vertically (not diagonally).',
      topics: ['Graphs'],
      inputFormat:
        'Line 1: two integers `rows` and `cols`. The next `rows` lines each contain ' +
        '`cols` space-separated 0/1 values.',
      outputFormat: 'A single integer — the number of islands.',
      constraints: '1 <= rows, cols <= 300',
      sampleCases: [
        {
          input: '3 3\n1 1 0\n0 1 0\n1 0 0',
          output: '2',
          explanation:
            'The top-left 1s form one connected island; the bottom-left 1 is a separate island.',
        },
      ],
      testCases: [
        { input: '3 3\n1 1 0\n0 1 0\n1 0 0', expectedOutput: '2' },
        { input: '2 2\n1 1\n1 1', expectedOutput: '1' },
        { input: '2 2\n0 0\n0 0', expectedOutput: '0' },
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
