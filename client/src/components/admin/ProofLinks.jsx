/**
 * The links an applicant gave as proof. Each is shown as plain text, and is a link only when it is a plain
 * https URL; it opens in a new tab without sending the admin page's address along. Nothing is fetched here.
 */
export default function ProofLinks({ links, linkable = true }) {
  const safe = (url) => /^https:\/\//i.test(url);
  if (!links?.length) return <span className="text-fg-muted">None given.</span>;
  return (
    <ul className="space-y-1">
      {links.map((url) => (
        <li key={url} className="break-all">
          {linkable && safe(url)
            ? <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent-text hover:underline">{url}</a>
            : <span className="text-fg-muted">{url}</span>}
        </li>
      ))}
    </ul>
  );
}
