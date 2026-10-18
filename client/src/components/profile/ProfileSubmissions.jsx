import { History } from 'lucide-react';
import { usePagedList } from '../../api/usePagedList.js';
import PagedSection from '../PagedSection.jsx';
import SubmissionsTable from '../SubmissionsTable.jsx';
import { Button, EmptyState } from '../ui/index.js';

/** The student's whole submission history, ten at a time. The cursor is the `sub` parameter in the URL. */
export default function ProfileSubmissions() {
  const list = usePagedList({ url: '/submissions', itemsKey: 'submissions', param: 'sub' });
  return (
    <PagedSection
      id="profile-submissions" heading="Submissions" label="submissions" list={list} skeletonColumns={5}
      empty={<EmptyState icon={History} title="No submissions yet" description="Solve a problem to see your history here." action={<Button variant="primary" to="/problems">Browse problems</Button>} />}
    >
      {(items) => <SubmissionsTable submissions={items} label="Submissions" />}
    </PagedSection>
  );
}
