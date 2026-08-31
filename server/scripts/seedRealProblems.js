import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Problem from '../models/Problem.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// One-off: replace the throwaway "Pagination Test N" placeholders with 20 real
// coding problems under the demo teacher, so /problems has enough rows to
// page through locally with content actually worth solving.
// Safe to re-run: upserts by title. Run with DELETE=1 to remove just these.

const problems = [
  {
    title: 'Reverse a String',
    description: 'Read a string and print it reversed.',
    topics: ['Strings'],
    inputFormat: 'A single line containing a string `s`.',
    outputFormat: '`s` reversed.',
    constraints: '1 <= length of s <= 1000',
    sampleCases: [{ input: 'hello', output: 'olleh', explanation: 'Reading "hello" backwards gives "olleh".' }],
    starterCode: { python: 's = input()\nprint(s[::-1])\n' },
    testCases: [
      { input: 'hello', expectedOutput: 'olleh' },
      { input: 'ab', expectedOutput: 'ba' },
      { input: 'a', expectedOutput: 'a' },
    ],
  },
  {
    title: 'Check Prime',
    description: 'Given an integer n, print "true" if it is prime, otherwise "false".',
    topics: ['Math'],
    inputFormat: 'A single line containing one integer `n`.',
    outputFormat: '`true` if `n` is prime, otherwise `false`.',
    constraints: '1 <= n <= 10^6',
    sampleCases: [
      { input: '7', output: 'true', explanation: '7 has no divisors other than 1 and 7.' },
      { input: '8', output: 'false', explanation: '8 = 2 * 4.' },
    ],
    starterCode: {
      python:
        'n = int(input())\n' +
        '# print "true" if n is prime, otherwise "false"\n',
    },
    testCases: [
      { input: '2', expectedOutput: 'true' },
      { input: '4', expectedOutput: 'false' },
      { input: '17', expectedOutput: 'true' },
      { input: '1', expectedOutput: 'false' },
    ],
  },
  {
    title: 'Factorial of N',
    description: 'Given n, print n! (n factorial).',
    topics: ['Recursion', 'Math'],
    inputFormat: 'A single line containing one integer `n`.',
    outputFormat: '`n!`.',
    constraints: '0 <= n <= 20',
    sampleCases: [{ input: '5', output: '120', explanation: '5! = 5*4*3*2*1 = 120.' }],
    starterCode: { python: 'n = int(input())\n# print n!\n' },
    testCases: [
      { input: '0', expectedOutput: '1' },
      { input: '1', expectedOutput: '1' },
      { input: '5', expectedOutput: '120' },
      { input: '6', expectedOutput: '720' },
    ],
  },
  {
    title: 'GCD of Two Numbers',
    description: 'Read two positive integers and print their greatest common divisor.',
    topics: ['Math'],
    inputFormat: 'A single line containing two space-separated integers `a` and `b`.',
    outputFormat: 'The greatest common divisor of `a` and `b`.',
    constraints: '1 <= a, b <= 10^9',
    sampleCases: [{ input: '12 18', output: '6', explanation: 'The largest number dividing both 12 and 18 is 6.' }],
    starterCode: { python: 'a, b = map(int, input().split())\n# print gcd(a, b)\n' },
    testCases: [
      { input: '12 18', expectedOutput: '6' },
      { input: '7 13', expectedOutput: '1' },
      { input: '100 75', expectedOutput: '25' },
    ],
  },
  {
    title: 'Sum of Array Elements',
    description: 'Given an array of n integers, print the sum of its elements.',
    topics: ['Arrays'],
    inputFormat: 'Line 1: an integer `n`. Line 2: `n` space-separated integers.',
    outputFormat: 'The sum of the array elements.',
    constraints: '1 <= n <= 10^5\n-10^9 <= a[i] <= 10^9',
    sampleCases: [{ input: '5\n1 2 3 4 5', output: '15', explanation: '1+2+3+4+5 = 15.' }],
    starterCode: {
      python: 'n = int(input())\na = list(map(int, input().split()))\n# print sum(a)\n',
    },
    testCases: [
      { input: '3\n1 2 3', expectedOutput: '6' },
      { input: '4\n-1 -2 3 4', expectedOutput: '4' },
    ],
  },
  {
    title: 'Second Largest Element',
    description:
      'Given an array of n integers, print the second largest DISTINCT value. It is guaranteed ' +
      'the array has at least two distinct values.',
    topics: ['Arrays'],
    inputFormat: 'Line 1: an integer `n`. Line 2: `n` space-separated integers.',
    outputFormat: 'The second largest distinct value in the array.',
    constraints: '2 <= n <= 10^5',
    sampleCases: [{ input: '5\n3 8 2 10 6', output: '8', explanation: 'Largest is 10, second largest is 8.' }],
    testCases: [
      { input: '5\n3 8 2 10 6', expectedOutput: '8' },
      { input: '4\n5 5 5 3', expectedOutput: '3' },
      { input: '3\n1 2 2', expectedOutput: '1' },
    ],
  },
  {
    title: 'Rotate Array by K',
    description: 'Given an array of n integers, rotate it to the right by k positions and print the result.',
    topics: ['Arrays'],
    inputFormat: 'Line 1: two integers `n` and `k`. Line 2: `n` space-separated integers.',
    outputFormat: 'The array after rotating right by `k` positions, space-separated.',
    constraints: '1 <= n <= 10^5\n0 <= k <= n',
    sampleCases: [{ input: '5 2\n1 2 3 4 5', output: '4 5 1 2 3', explanation: 'Rotating [1,2,3,4,5] right by 2.' }],
    testCases: [
      { input: '5 2\n1 2 3 4 5', expectedOutput: '4 5 1 2 3' },
      { input: '4 1\n1 2 3 4', expectedOutput: '4 1 2 3' },
      { input: '3 3\n1 2 3', expectedOutput: '1 2 3' },
    ],
  },
  {
    title: 'Merge Two Sorted Arrays',
    description: 'Given two sorted (ascending) arrays, print their merge as one sorted array.',
    topics: ['Arrays', 'Sorting'],
    inputFormat:
      'Line 1: two integers `n` and `m`. Line 2: `n` space-separated integers (first array). ' +
      'Line 3: `m` space-separated integers (second array).',
    outputFormat: 'The merged, sorted array, space-separated.',
    constraints: '1 <= n, m <= 10^5',
    sampleCases: [{ input: '3 3\n1 3 5\n2 4 6', output: '1 2 3 4 5 6', explanation: 'Merging two sorted arrays.' }],
    testCases: [
      { input: '3 3\n1 3 5\n2 4 6', expectedOutput: '1 2 3 4 5 6' },
      { input: '2 2\n1 2\n1 2', expectedOutput: '1 1 2 2' },
      { input: '1 3\n5\n1 2 3', expectedOutput: '1 2 3 5' },
    ],
  },
  {
    title: 'Anagram Check',
    description:
      'Given two strings (one per line), print "true" if they are anagrams of each other ' +
      '(ignoring case), otherwise "false".',
    topics: ['Strings', 'Hashing'],
    inputFormat: 'Line 1: string `s1`. Line 2: string `s2`.',
    outputFormat: '`true` if `s1` and `s2` are anagrams (ignoring case), otherwise `false`.',
    constraints: '1 <= length of s1, s2 <= 1000',
    sampleCases: [{ input: 'listen\nsilent', output: 'true', explanation: 'Both contain the same letters.' }],
    testCases: [
      { input: 'listen\nsilent', expectedOutput: 'true' },
      { input: 'hello\nworld', expectedOutput: 'false' },
      { input: 'Dormitory\nDirtyroom', expectedOutput: 'true' },
    ],
  },
  {
    title: 'Longest Common Prefix',
    description:
      'Given n strings, print their longest common prefix. It is guaranteed a non-empty common ' +
      'prefix exists.',
    topics: ['Strings'],
    inputFormat: 'Line 1: an integer `n`. The next `n` lines each contain one string.',
    outputFormat: 'The longest common prefix shared by all `n` strings.',
    constraints: '2 <= n <= 200',
    sampleCases: [{ input: '3\nflower\nflow\nflight', output: 'fl', explanation: 'All three strings start with "fl".' }],
    testCases: [
      { input: '3\nflower\nflow\nflight', expectedOutput: 'fl' },
      { input: '2\ninterview\ninterval', expectedOutput: 'inter' },
      { input: '3\ndog\ndog\ndog', expectedOutput: 'dog' },
    ],
  },
  {
    title: 'Remove Duplicates from Sorted Array',
    description: 'Given a sorted (ascending) array, print its distinct elements in order.',
    topics: ['Arrays', 'Two Pointers'],
    inputFormat: 'Line 1: an integer `n`. Line 2: `n` space-separated, ascending integers.',
    outputFormat: 'The distinct elements, in ascending order, space-separated.',
    constraints: '1 <= n <= 10^5',
    sampleCases: [{ input: '5\n1 1 2 2 3', output: '1 2 3', explanation: 'Duplicates 1 and 2 are collapsed.' }],
    testCases: [
      { input: '5\n1 1 2 2 3', expectedOutput: '1 2 3' },
      { input: '4\n1 2 2 2', expectedOutput: '1 2' },
      { input: '3\n1 2 3', expectedOutput: '1 2 3' },
    ],
  },
  {
    title: 'Move Zeroes to End',
    description:
      'Given an array of n integers, move all zeroes to the end while keeping the relative order ' +
      'of the non-zero elements, and print the result.',
    topics: ['Arrays', 'Two Pointers'],
    inputFormat: 'Line 1: an integer `n`. Line 2: `n` space-separated integers.',
    outputFormat: 'The array with all zeroes moved to the end, space-separated.',
    constraints: '1 <= n <= 10^5',
    sampleCases: [{ input: '5\n0 1 0 3 12', output: '1 3 12 0 0', explanation: 'Non-zero order is preserved.' }],
    testCases: [
      { input: '5\n0 1 0 3 12', expectedOutput: '1 3 12 0 0' },
      { input: '3\n0 0 0', expectedOutput: '0 0 0' },
      { input: '4\n1 2 3 4', expectedOutput: '1 2 3 4' },
    ],
  },
  {
    title: 'Kth Largest Element',
    description: 'Given an array of n integers and k, print the k-th largest element (1-indexed; duplicates counted).',
    topics: ['Heaps', 'Sorting'],
    inputFormat: 'Line 1: two integers `n` and `k`. Line 2: `n` space-separated integers.',
    outputFormat: 'The k-th largest element of the array.',
    constraints: '1 <= k <= n <= 10^5',
    sampleCases: [{ input: '5 2\n3 2 1 5 6', output: '5', explanation: 'Sorted descending: 6 5 3 2 1 — the 2nd is 5.' }],
    testCases: [
      { input: '5 2\n3 2 1 5 6', expectedOutput: '5' },
      { input: '6 4\n3 2 3 1 2 4', expectedOutput: '2' },
      { input: '4 1\n1 2 3 4', expectedOutput: '4' },
    ],
  },
  {
    title: 'Implement Queue using Two Stacks',
    description:
      'Simulate a queue built from two stacks. Read q operations, each "enqueue x" or "dequeue". ' +
      'For every "dequeue", print the removed value on its own line, in order.',
    topics: ['Stacks & Queues'],
    inputFormat:
      'Line 1: an integer `q`. Each of the next `q` lines is either "enqueue x" or "dequeue".',
    outputFormat: 'One line per "dequeue" operation, printing the value removed.',
    constraints: '1 <= q <= 10^4\nEvery "dequeue" is on a non-empty queue.',
    sampleCases: [
      {
        input: '4\nenqueue 1\nenqueue 2\ndequeue\ndequeue',
        output: '1\n2',
        explanation: 'FIFO order: the values come out in the order they were enqueued.',
      },
    ],
    testCases: [
      { input: '4\nenqueue 1\nenqueue 2\ndequeue\ndequeue', expectedOutput: '1\n2' },
      { input: '3\nenqueue 5\ndequeue\nenqueue 7', expectedOutput: '5' },
      { input: '5\nenqueue 1\nenqueue 2\nenqueue 3\ndequeue\ndequeue', expectedOutput: '1\n2' },
    ],
  },
  {
    title: 'Detect Cycle in Linked List',
    description:
      'A linked list is given as n node values, followed by `pos` — the 0-indexed position the ' +
      'tail connects back to (-1 if it does not connect back, i.e. no cycle). Print "true" if the ' +
      'list has a cycle, otherwise "false".',
    topics: ['Linked List'],
    inputFormat:
      'Line 1: an integer `n`. Line 2: `n` space-separated integers (node values). ' +
      'Line 3: an integer `pos`.',
    outputFormat: '`true` if the list has a cycle, otherwise `false`.',
    constraints: '1 <= n <= 10^4\n-1 <= pos < n',
    sampleCases: [{ input: '4\n3 2 0 -4\n1', output: 'true', explanation: 'The tail connects back to index 1.' }],
    testCases: [
      { input: '4\n3 2 0 -4\n1', expectedOutput: 'true' },
      { input: '2\n1 2\n-1', expectedOutput: 'false' },
      { input: '1\n1\n-1', expectedOutput: 'false' },
    ],
  },
  {
    title: 'Height of Binary Tree',
    description:
      'A binary tree is given via its level-order serialization: n tokens, each an integer value ' +
      'or "N" for a null child (LeetCode-style — nulls have no children of their own). Print the ' +
      "tree's height (the number of nodes on the longest root-to-leaf path).",
    topics: ['Trees'],
    inputFormat: 'Line 1: an integer `n`. Line 2: `n` space-separated tokens (integers or "N").',
    outputFormat: "The tree's height.",
    constraints: '1 <= n <= 10^4',
    sampleCases: [
      {
        input: '7\n1 2 3 N N 4 5',
        output: '3',
        explanation: 'Root 1 -> right 3 -> right 5 (or left 4) is the longest path: 3 nodes.',
      },
    ],
    testCases: [
      { input: '1\n1', expectedOutput: '1' },
      { input: '3\n1 2 3', expectedOutput: '2' },
      { input: '7\n1 2 3 N N 4 5', expectedOutput: '3' },
    ],
  },
  {
    title: 'XOR of Array Elements',
    description: 'Given an array of n integers, print the bitwise XOR of all its elements.',
    topics: ['Bit Manipulation'],
    inputFormat: 'Line 1: an integer `n`. Line 2: `n` space-separated integers.',
    outputFormat: 'The XOR of every element in the array.',
    constraints: '1 <= n <= 10^5\n0 <= a[i] <= 10^9',
    sampleCases: [{ input: '4\n1 2 3 4', output: '4', explanation: '1 ^ 2 ^ 3 ^ 4 = 4.' }],
    testCases: [
      { input: '4\n1 2 3 4', expectedOutput: '4' },
      { input: '3\n5 5 5', expectedOutput: '5' },
      { input: '1\n7', expectedOutput: '7' },
    ],
  },
  {
    title: 'Climbing Stairs',
    description:
      'You are climbing a staircase of n steps. Each move you can climb 1 or 2 steps. Print the ' +
      'number of distinct ways to reach the top.',
    topics: ['Dynamic Programming'],
    inputFormat: 'A single line containing one integer `n`.',
    outputFormat: 'The number of distinct ways to climb `n` steps using 1- or 2-steps.',
    constraints: '1 <= n <= 45',
    sampleCases: [{ input: '3', output: '3', explanation: '1+1+1, 1+2, 2+1 — three ways.' }],
    testCases: [
      { input: '2', expectedOutput: '2' },
      { input: '3', expectedOutput: '3' },
      { input: '5', expectedOutput: '8' },
    ],
  },
  {
    title: 'House Robber',
    description:
      'Given the amount of money in n houses (in a row), print the maximum total you can rob ' +
      'without robbing two adjacent houses.',
    topics: ['Dynamic Programming'],
    inputFormat: 'Line 1: an integer `n`. Line 2: `n` space-separated non-negative integers.',
    outputFormat: 'The maximum amount that can be robbed without robbing two adjacent houses.',
    constraints: '1 <= n <= 10^5\n0 <= a[i] <= 10^4',
    sampleCases: [
      { input: '4\n1 2 3 1', output: '4', explanation: 'Rob house 1 (value 1) and house 3 (value 3): 1 + 3 = 4.' },
    ],
    testCases: [
      { input: '4\n1 2 3 1', expectedOutput: '4' },
      { input: '5\n2 7 9 3 1', expectedOutput: '12' },
      { input: '1\n5', expectedOutput: '5' },
    ],
  },
  {
    title: 'Generate Subsets',
    description:
      'Given n distinct integers in ascending order, print every subset (the power set). Generate ' +
      'them via standard DFS backtracking — at each step print the current subset (elements ' +
      'space-separated, empty line for the empty subset), then extend it with each remaining ' +
      'element in turn.',
    topics: ['Backtracking'],
    inputFormat: 'Line 1: an integer `n`. Line 2: `n` space-separated, ascending distinct integers.',
    outputFormat: 'Every subset, one per line, in DFS backtracking order (empty subset first).',
    constraints: '1 <= n <= 12',
    sampleCases: [
      {
        input: '2\n1 2',
        output: '\n1\n1 2\n2',
        explanation: 'DFS order: {}, {1}, {1,2}, {2}.',
      },
    ],
    testCases: [
      { input: '2\n1 2', expectedOutput: '\n1\n1 2\n2' },
      { input: '1\n5', expectedOutput: '\n5' },
      { input: '3\n1 2 3', expectedOutput: '\n1\n1 2\n1 2 3\n1 3\n2\n2 3\n3' },
    ],
  },
];

async function run() {
  await connectDB();

  const teacher = await User.findOneAndUpdate(
    { email: 'teacher@demo.com' },
    {
      name: 'Demo Teacher',
      email: 'teacher@demo.com',
      role: 'teacher',
      passwordHash: await User.hashPassword('password123'),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const oldTitles = Array.from({ length: 20 }, (_, i) => `Pagination Test ${i + 1}`);
  const { deletedCount } = await Problem.deleteMany({ title: { $in: oldTitles } });
  console.log(`Removed ${deletedCount} placeholder problem(s).`);

  if (process.env.DELETE) {
    const titles = problems.map((p) => p.title);
    const res = await Problem.deleteMany({ title: { $in: titles } });
    console.log(`Deleted ${res.deletedCount} seeded problems.`);
    await mongoose.disconnect();
    return;
  }

  for (const p of problems) {
    await Problem.findOneAndUpdate({ title: p.title }, { ...p, createdBy: teacher._id }, { upsert: true });
    console.log(`Upserted: ${p.title}`);
  }

  await mongoose.disconnect();
  console.log(`Done — ${problems.length} problems seeded.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
