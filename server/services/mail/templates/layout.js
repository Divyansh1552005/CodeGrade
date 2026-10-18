// Shared look for every email: plain inline-styled table, one button, the raw link below it, no images.
const COLORS = { text: '#1f2328', muted: '#59636e', border: '#d1d9e0', button: '#4338ca', buttonText: '#ffffff' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** "24 hours", "1 hour", "30 minutes" */
export function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

function safeLink(link) {
  const url = new URL(link); // throws on garbage
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Email links must be http or https');
  return url.toString();
}

/**
 * paragraphs: plain strings (escaped here). action: { label, link } or null. footer: strings.
 * Returns { html, text }.
 */
export function renderEmail({ title, paragraphs, action, footer }) {
  const link = action ? safeLink(action.link) : null;
  const p = (content) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:${COLORS.text}">${content}</p>`;
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto"><tr><td>
<h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:${COLORS.text}">${escapeHtml(title)}</h1>
${paragraphs.map((text) => p(escapeHtml(text))).join('\n')}
${link ? `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:${COLORS.button};color:${COLORS.buttonText};font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(action.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${COLORS.muted}">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>` : ''}
<hr style="border:0;border-top:1px solid ${COLORS.border};margin:24px 0">
${footer.map((text) => `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${COLORS.muted}">${escapeHtml(text)}</p>`).join('\n')}
</td></tr></table></body></html>`;
  const text = [title, '', ...paragraphs.flatMap((t) => [t, '']), ...(link ? [`${action.label}:`, link, ''] : []), '--', ...footer].join('\n');
  return { html, text };
}
