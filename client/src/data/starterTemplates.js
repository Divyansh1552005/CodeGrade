// Default starter-code templates per language. These read from stdin correctly
// for each language (Java uses Scanner, C++ uses cin), since input-parsing
// syntax differs a lot and is a common source of wrong-answer false negatives.
export const STARTER_TEMPLATES = {
  python: `import sys

data = sys.stdin.read().split()
# parse input from data and print your answer
`,
  javascript: `const data = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/);
// parse input from data and console.log your answer
`,
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // read input with sc.nextInt()/sc.next() and print your answer
    }
}
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    // read input with cin and print your answer with cout
    return 0;
}
`,
};

export const LANGUAGE_LABELS = {
  python: 'Python',
  javascript: 'JavaScript',
  java: 'Java',
  cpp: 'C++',
};
