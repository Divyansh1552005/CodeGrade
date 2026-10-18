import { Link } from 'react-router-dom';
import { StatusBadge, TBody, Table, Td, Th, THead, Tr } from './ui/index.js';
import { verdictOf } from '../lib/submissionStatus.js';
import { LANGUAGE_LABELS } from '../data/starterTemplates.js';

/** Rows of the light submission list: problem, verdict, tests passed, language and time. */
export default function SubmissionsTable({ submissions, label }) {
  return (
    <Table aria-label={label}>
      <THead>
        <Tr className="hover:bg-transparent">
          <Th>Problem</Th>
          <Th>Status</Th>
          <Th numeric>Passed</Th>
          <Th className="hidden sm:table-cell">Language</Th>
          <Th className="hidden sm:table-cell">Submitted</Th>
        </Tr>
      </THead>
      <TBody>
        {submissions.map((s) => (
          <Tr key={s._id}>
            <Td>
              {s.problemId
                ? <Link to={`/submit/${s.problemId}`} className="block max-w-32 truncate rounded-sm font-medium hover:text-accent-text hover:underline sm:max-w-xs">{s.problemTitle || 'Problem'}</Link>
                : <span className="text-fg-muted">Removed problem</span>}
            </Td>
            <Td><StatusBadge status={verdictOf(s)} /></Td>
            <Td numeric>{s.status === 'graded' ? `${s.passCount}/${s.totalCount}` : '-'}</Td>
            <Td className="hidden sm:table-cell">{LANGUAGE_LABELS[s.language] || s.language}</Td>
            <Td className="hidden whitespace-nowrap text-fg-muted sm:table-cell">{new Date(s.createdAt).toLocaleString()}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
