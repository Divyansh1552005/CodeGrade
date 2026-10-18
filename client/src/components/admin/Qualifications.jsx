import ProofLinks from './ProofLinks.jsx';

/** What someone gave when they applied to teach: organization, degree, links and note, all as text. */
export default function Qualifications({ application }) {
  const row = (label, value) => (
    <div><dt className="text-sm font-medium">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-fg-muted">{value}</dd></div>
  );
  return (
    <dl className="space-y-4 text-base">
      {row('Organization', application.organization || 'Not given.')}
      {row('Degree', application.degree || 'Not given.')}
      {row('Degree link', <ProofLinks links={application.degreeLink ? [application.degreeLink] : []} />)}
      {row('Other proof', <ProofLinks links={application.proofLinks} />)}
      {row('About', application.note || 'No note.')}
    </dl>
  );
}
