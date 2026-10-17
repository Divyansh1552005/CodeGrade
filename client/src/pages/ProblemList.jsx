import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, ChevronDown, Code2, Pencil, Plus, Search, SearchX, Trash2, X } from 'lucide-react';
import { api } from '../api/client.js';
import { useCachedQuery } from '../api/useCachedQuery.js';
import { usePaginatedQuery } from '../api/usePaginatedQuery.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { TOPICS } from '../data/topics.js';
import {
  Badge, Button, DifficultyBadge, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger, EmptyState,
  ErrorState, Icon, Input, PageHeader, Select, TBody, Table, TableSkeleton, Td, Th, THead, Tr,
} from '../components/ui/index.js';

const VISIBLE_TOPICS = 2;

export default function ProblemList() {
  const { user } = useAuth();
  const isTeacher = user.role === 'teacher';
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [status, setStatus] = useState('');
  // Topics are filtered by the server; search, difficulty and status filter the rows loaded so far.
  const query = selectedTopics.length
    ? `/problems?topics=${selectedTopics.map(encodeURIComponent).join(',')}`
    : '/problems';
  const {
    items: problems,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    refetch,
  } = usePaginatedQuery(query, 'problems');
  const { data: stats } = useCachedQuery('/problems/stats/counts');

  const [pendingDelete, setPendingDelete] = useState(null); // problem being confirmed
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    const problem = pendingDelete;
    setDeleting(true);
    try {
      const { data: res } = await api.delete(`/problems/${problem._id}`);
      refetch();
      setPendingDelete(null);
      toast.success(
        res.softDeleted ? 'Problem archived (it has existing submissions).' : 'Problem deleted.'
      );
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () => problems.filter((p) => {
      if (difficulty && (p.difficulty || 'easy') !== difficulty) return false;
      if (status === 'solved' && !p.solved) return false;
      if (status === 'unsolved' && p.solved) return false;
      if (needle && !`${p.title} ${(p.topics || []).join(' ')}`.toLowerCase().includes(needle)) return false;
      return true;
    }),
    [problems, difficulty, status, needle]
  );

  const availableTopics = stats?.byTopic ? TOPICS.filter((t) => stats.byTopic[t] > 0) : [];
  const rowFilters = Boolean(needle || difficulty || status);
  const filtered = rowFilters || selectedTopics.length > 0;
  function clearFilters() {
    setSelectedTopics([]); setSearch(''); setDifficulty(''); setStatus('');
  }
  function toggleTopic(topic, checked) {
    setSelectedTopics((current) => (checked ? [...current, topic] : current.filter((t) => t !== topic)));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Problems"
        action={isTeacher && <Button variant="primary" to="/problems/new"><Icon as={Plus} />Create problem</Button>}
      />

      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Icon as={Search} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <Input type="search" aria-label="Search problems" placeholder="Search title or topic" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-36">
          <Select aria-label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="">All difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        </div>
        {!isTeacher && (
          <div className="w-32">
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="solved">Solved</option>
              <option value="unsolved">Unsolved</option>
            </Select>
          </div>
        )}
        {availableTopics.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                Topics{selectedTopics.length > 0 && <Badge tone="accent">{selectedTopics.length}</Badge>}
                <Icon as={ChevronDown} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              {availableTopics.map((topic) => (
                <DropdownMenuCheckboxItem
                  key={topic}
                  checked={selectedTopics.includes(topic)}
                  onCheckedChange={(checked) => toggleTopic(topic, checked)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {topic}
                  <span className="ml-auto pl-4 tabular-nums text-fg-subtle">{stats.byTopic[topic]}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {filtered && <Button variant="ghost" onClick={clearFilters}><Icon as={X} />Clear filters</Button>}
        <span className="ml-auto text-sm tabular-nums text-fg-muted" aria-live="polite">
          {loading ? '' : filtered ? `${visible.length} shown` : `${stats?.total ?? problems.length} problems`}
        </span>
      </div>

      {selectedTopics.length > 0 && (
        <ul aria-label="Active topic filters" className="mb-3 flex shrink-0 flex-wrap gap-2">
          {selectedTopics.map((topic) => (
            <li key={topic}>
              <Badge tone="accent" className="h-6 pr-1">
                {topic}
                <button type="button" aria-label={`Remove ${topic} filter`} className="inline-flex size-4 items-center justify-center rounded-full hover:bg-surface" onClick={() => toggleTopic(topic, false)}>
                  <Icon as={X} className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {error && <ErrorState message={error} onRetry={refetch} />}
      {loading && <TableSkeleton rows={8} columns={5} />}

      {!loading && !error && problems.length === 0 && (
        <EmptyState
          icon={selectedTopics.length ? SearchX : Code2}
          title={selectedTopics.length ? 'No problems match these topics' : 'No problems yet'}
          description={selectedTopics.length ? 'Clear the topic filter to see every problem.' : isTeacher ? 'Create the first problem to start the library.' : 'Problems appear here once a teacher adds one.'}
          action={selectedTopics.length ? <Button onClick={clearFilters}>Clear filters</Button> : isTeacher ? <Button variant="primary" to="/problems/new">Create problem</Button> : undefined}
        />
      )}

      {!loading && !error && problems.length > 0 && visible.length === 0 && (
        <EmptyState
          icon={SearchX}
          title="No matching problems"
          description={hasMore ? 'Nothing among the problems loaded so far matches. Load more to search further.' : 'Try a different search or clear the filters.'}
          action={<div className="flex gap-2"><Button onClick={clearFilters}>Clear filters</Button>{hasMore && <Button onClick={loadMore} loading={loadingMore}>Load more</Button>}</div>}
        />
      )}

      {!loading && visible.length > 0 && (
        <Table aria-label="Problems" wrapperClassName="min-h-0">
          <THead>
            <Tr className="hover:bg-transparent">
              {!isTeacher && <Th className="w-16">Status</Th>}
              <Th numeric className="w-16">#</Th>
              <Th>Title</Th>
              <Th>Difficulty</Th>
              <Th>Topics</Th>
              {isTeacher && <Th numeric>Tests</Th>}
              {isTeacher && <Th className="w-24"><span className="sr-only">Actions</span></Th>}
            </Tr>
          </THead>
          <TBody>
            {visible.map((p) => {
              const mine = isTeacher && String(p.createdBy) === String(user.id || user._id);
              const topics = p.topics || [];
              return (
                <Tr key={p._id}>
                  {!isTeacher && (
                    <Td>{p.solved && <><Icon as={CheckCircle2} className="text-success" /><span className="sr-only">Solved</span></>}</Td>
                  )}
                  <Td numeric className="text-fg-muted">{typeof p.number === 'number' ? p.number : ''}</Td>
                  <Td>
                    {isTeacher ? (
                      <span className="block max-w-md truncate font-medium" title={p.title}>{p.title}</span>
                    ) : (
                      <Link to={`/submit/${p._id}`} className="block max-w-md truncate rounded-sm font-medium hover:text-accent-text hover:underline" title={p.title}>{p.title}</Link>
                    )}
                  </Td>
                  <Td><DifficultyBadge level={p.difficulty || 'easy'} /></Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      {topics.slice(0, VISIBLE_TOPICS).map((topic) => <Badge key={topic}>{topic}</Badge>)}
                      {topics.length > VISIBLE_TOPICS && <Badge title={topics.slice(VISIBLE_TOPICS).join(', ')}>+{topics.length - VISIBLE_TOPICS}</Badge>}
                    </div>
                  </Td>
                  {isTeacher && <Td numeric>{p.testCases?.length || 0}</Td>}
                  {isTeacher && (
                    <Td>
                      {mine && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" iconOnly to={`/problems/${p._id}/edit`} aria-label={`Edit ${p.title}`}><Icon as={Pencil} /></Button>
                          <Button variant="ghost" size="sm" iconOnly aria-label={`Delete ${p.title}`} onClick={() => setPendingDelete(p)}><Icon as={Trash2} /></Button>
                        </div>
                      )}
                    </Td>
                  )}
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}

      {hasMore && !loading && visible.length > 0 && (
        <div className="mt-3 flex shrink-0 items-center justify-center gap-3">
          {rowFilters && <span className="text-sm text-fg-muted">Search and filters only cover the problems loaded so far.</span>}
          <Button onClick={loadMore} loading={loadingMore}>Load more</Button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => !deleting && setPendingDelete(null)}
        onConfirm={confirmDelete}
        busy={deleting}
        title="Delete problem?"
        message={
          <>
            This will delete <strong>{pendingDelete?.title}</strong>. If students have already
            submitted solutions, it will be archived instead so their history is preserved.
          </>
        }
        confirmLabel="Delete"
      />
    </div>
  );
}
