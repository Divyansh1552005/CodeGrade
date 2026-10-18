// A short plain-text preview of a markdown doubt, for list rows. Server-side so a list never has to
// carry the full text. Never cuts in the middle of a character: it counts what a reader sees as one
// character (a grapheme: an emoji with a skin tone, a letter with an accent), not UTF-16 units.
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function plainText(markdown) {
  return String(markdown ?? '')
    .replace(/(```|~~~)[\s\S]*?(\1|$)/g, ' ') // fenced code blocks, including an unclosed one
    .replace(/`([^`]*)`/g, '$1') // inline code keeps its text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images keep the alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links keep the link text
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ') // html tags
    .replace(/^\s{0,3}(#{1,6}|>+|[-*+]|\d+[.)])\s+/gm, '') // headings, quotes, list markers
    .replace(/^\s*([-*_]\s*){3,}$/gm, ' ') // horizontal rules
    .replace(/\*\*|\*|~~|__/g, '')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1$2') // _emphasis_, but not snake_case
    .replace(/\|/g, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * At most `max` characters, ending in an ellipsis when it was cut. Only the start of a long text is
 * segmented (a cut text has far more than `max` characters in its first `max * 8` UTF-16 units), so a
 * list of long doubts stays cheap; unusually long characters fall back to segmenting the whole text.
 */
export function makePreview(markdown, max = 160) {
  const text = plainText(markdown);
  const head = text.length > max * 8 ? text.slice(0, max * 8) : text;
  let characters = [...segmenter.segment(head)].map((part) => part.segment);
  if (characters.length <= max && head.length < text.length) {
    characters = [...segmenter.segment(text)].map((part) => part.segment);
  }
  if (characters.length <= max) return text;
  return `${characters.slice(0, max - 1).join('').trimEnd()}…`;
}
