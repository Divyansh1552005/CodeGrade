/** "alice@example.com" -> "a***@e***.com". Anything that is not an address becomes "***". */
export function maskEmail(value) {
  const email = String(value ?? '');
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local[0]}***@${host[0]}***${tld}`;
}
