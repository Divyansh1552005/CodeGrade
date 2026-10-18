import { describe, it, expect } from '@jest/globals';
import { makePreview, plainText } from '../../utils/preview.js';

describe('plainText', () => {
  it('strips markdown formatting but keeps the words', () => {
    expect(plainText('# Title\n\nSome **bold** and _italic_ and ~~gone~~ text')).toBe('Title Some bold and italic and gone text');
    expect(plainText('- one\n- two\n1. three\n> quoted')).toBe('one two three quoted');
    expect(plainText('See [the docs](https://example.com) and ![a diagram](x.png)')).toBe('See the docs and a diagram');
    expect(plainText('Use `len(x)` here')).toBe('Use len(x) here');
    expect(plainText('| a | b |\n|---|---|\n| 1 | 2 |')).toBe('a b --- --- 1 2');
  });
  it('removes fenced code blocks entirely, including an unclosed one and tilde fences', () => {
    expect(plainText('Before\n```python\nsecret = 1\nprint(secret)\n```\nAfter')).toBe('Before After');
    expect(plainText('Before ~~~\nhidden\n~~~ after')).toBe('Before after');
    expect(plainText('Intro\n```js\nconst leaked = true;')).toBe('Intro');
  });
  it('removes html tags, keeps snake_case, collapses whitespace and strips control characters', () => {
    expect(plainText('a <b>bold</b>\n\n\n  tag <script>x</script>')).toBe('a bold tag x');
    expect(plainText('use my_variable_name here')).toBe('use my_variable_name here');
    expect(plainText('a\u0000b\u0007c   d')).toBe('abc d');
  });
  it('handles empty and missing input', () => {
    expect(plainText('')).toBe('');
    expect(plainText(undefined)).toBe('');
    expect(plainText(null)).toBe('');
  });
});

describe('makePreview', () => {
  it('returns short text unchanged', () => {
    expect(makePreview('Why is my loop slow?')).toBe('Why is my loop slow?');
  });
  it('is at most 160 characters and ends with an ellipsis when cut', () => {
    const preview = makePreview('word '.repeat(100));
    expect([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(preview)].length).toBeLessThanOrEqual(160);
    expect(preview.endsWith('…')).toBe(true);
    expect(makePreview('x'.repeat(160))).toBe('x'.repeat(160));
    expect(makePreview('x'.repeat(161))).toBe(`${'x'.repeat(159)}…`);
  });
  it('never cuts a character in half: emoji, accents and joined emoji stay whole', () => {
    const family = '👨‍👩‍👧‍👦'; // one visible character made of 7 code points
    const text = `${'a'.repeat(158)}${family}${family}${family}`; // 161 visible characters
    expect(makePreview(`${'a'.repeat(158)}${family}${family}`)).toBe(`${'a'.repeat(158)}${family}${family}`); // exactly 160 fits
    const preview = makePreview(text);
    expect(preview).toBe(`${'a'.repeat(158)}${family}…`); // cut between whole emoji, never inside one
    const accented = `${'é'.repeat(200)}`; // e + combining accent, 200 visible characters
    const cut = makePreview(accented);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.replace('…', '')).toBe('é'.repeat(159));
    const astral = makePreview('😀'.repeat(300));
    expect(astral).toBe(`${'😀'.repeat(159)}…`);
    expect(() => encodeURIComponent(astral)).not.toThrow(); // no lone surrogate
  });
  it('stays correct for very long texts and for texts made of unusually long characters', () => {
    expect(makePreview('word '.repeat(5000)).length).toBeLessThanOrEqual(160);
    const zalgo = `a${'\u0301'.repeat(300)}`; // one visible character built from 301 code points
    expect(makePreview(zalgo.repeat(5))).toBe(zalgo.repeat(5)); // five visible characters: nothing is cut
    expect(makePreview(`${zalgo}${'b'.repeat(400)}`).endsWith('…')).toBe(true);
  });
  it('previews the text, not the code, of a doubt with a code block', () => {
    expect(makePreview('My loop is slow.\n```python\nfor i in range(10**9):\n    pass\n```\nHow do I fix it?')).toBe('My loop is slow. How do I fix it?');
  });
  it('honours a different maximum', () => {
    expect(makePreview('abcdefghij', 5)).toBe('abcd…');
  });
});
