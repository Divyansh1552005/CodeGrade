// Free text typed by a stranger (a name, an organization, a note) is stored and shown as plain text: it is
// never rendered as HTML or markdown and a link in it is never made clickable. Before it is stored it is
// normalised (NFC) and stripped of control characters and the invisible bidirectional and zero-width
// characters that make text look like something it is not (for example a reversed email address).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g; // keeps tab and newline
const INVISIBLE = /[؜᠎​-‏‪-‮⁠-⁤⁦-⁯﻿]/g;

export function cleanText(value, { multiline = false } = {}) {
  let text = String(value ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(CONTROL, '').replace(INVISIBLE, '');
  text = multiline ? text.replace(/\n{3,}/g, '\n\n') : text.replace(/\s+/g, ' ');
  return text.trim();
}
