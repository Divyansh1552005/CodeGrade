import { Link } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { usePagedList } from '../../api/usePagedList.js';
import { doubtStatus } from '../../lib/doubtStatus.js';
import PagedSection from '../PagedSection.jsx';
import { Badge, Button, EmptyState, TBody, Table, Td, Th, THead, Tr } from '../ui/index.js';

/** The student's own doubts, ten at a time, with the server's short preview. The cursor is the `dbt` URL parameter. */
export default function ProfileDoubts() {
  const list = usePagedList({ url: '/doubts?mine=1', itemsKey: 'doubts', param: 'dbt' });
  return (
    <PagedSection
      id="my-doubts" heading="Doubts" label="doubts" list={list} skeletonColumns={3}
      empty={<EmptyState icon={MessagesSquare} title="No doubts yet" description="Ask a question and a teacher will review the answer before you see it." action={<Button variant="primary" to="/doubts/new">Ask a doubt</Button>} />}
    >
      {(items) => (
        <Table aria-label="Your doubts">
          <THead>
            <Tr className="hover:bg-transparent">
              <Th>Title</Th>
              <Th>Status</Th>
              <Th className="hidden sm:table-cell">Asked</Th>
            </Tr>
          </THead>
          <TBody>
            {items.map((d) => {
              const status = doubtStatus(d, 'student');
              return (
                <Tr key={d._id}>
                  <Td className="h-auto py-2">
                    <Link to={`/doubts/${d._id}`} className="block max-w-36 rounded-sm sm:max-w-md">
                      <span className="block truncate font-medium hover:text-accent-text hover:underline">{d.title}</span>
                      {d.preview && <span className="block truncate text-sm text-fg-muted">{d.preview}</span>}
                    </Link>
                  </Td>
                  <Td><Badge tone={status.tone}>{status.label}</Badge></Td>
                  <Td className="hidden whitespace-nowrap text-fg-muted sm:table-cell">{new Date(d.createdAt).toLocaleString()}</Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}
    </PagedSection>
  );
}
