import { useState } from 'react';
import { Inbox, Play, Settings } from 'lucide-react';
import {
  Avatar, Badge, Button, Checkbox, CodeBlock, DifficultyBadge, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, EmptyState, ErrorState, Field, Icon, Input, Modal, PageHeader, Panel, PanelBody, PanelHeader,
  Progress, Select, Skeleton, StatusBadge, TBody, Table, TableSkeleton, Tabs, TabsContent, TabsList, TabsTrigger,
  Td, Textarea, Th, THead, Tooltip, Tr,
} from '../components/ui/index.js';
import { useTheme } from '../theme/ThemeContext.jsx';

// Dev-only page for checking shared components in both themes. Removed in the final cleanup.
export default function UiGallery() {
  const [open, setOpen] = useState(false);
  const { toggleTheme } = useTheme();
  return (
    <div className="space-y-8">
      <PageHeader title="UI components" description="Development reference for the shared component set." action={<Button onClick={toggleTheme}>Toggle theme</Button>} />
      <Panel>
        <PanelHeader title="Buttons" />
        <PanelBody className="flex flex-wrap items-center gap-3">
          <Button variant="primary"><Icon as={Play} />Run code</Button>
          <Button variant="primary" loading>Submit solution</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
          <Tooltip content="Settings"><Button iconOnly aria-label="Settings"><Icon as={Settings} /></Button></Tooltip>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Form controls" />
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" hint="We never share it."><Input placeholder="you@example.com" /></Field>
          <Field label="Password" error="Password must be at least 8 characters."><Input type="password" defaultValue="abc" /></Field>
          <Field label="Language"><Select defaultValue="py"><option value="py">Python</option><option value="js">JavaScript</option></Select></Field>
          <Field label="Notes"><Textarea /></Field>
          <Checkbox label="Remember me" />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Badges" />
        <PanelBody className="flex flex-wrap gap-2">
          <DifficultyBadge level="easy" /><DifficultyBadge level="medium" /><DifficultyBadge level="hard" />
          {['accepted', 'wrong_answer', 'time_limit', 'runtime_error', 'compile_error', 'pending', 'queued', 'running'].map((s) => <StatusBadge key={s} status={s} />)}
          <Badge>Neutral</Badge><Badge tone="accent">Accent</Badge>
        </PanelBody>
      </Panel>
      <Table>
        <THead><Tr><Th>Title</Th><Th>Difficulty</Th><Th numeric>Acceptance</Th></Tr></THead>
        <TBody>
          <Tr><Td>Two sum</Td><Td><DifficultyBadge level="easy" /></Td><Td numeric>52.4%</Td></Tr>
          <Tr><Td>Merge intervals</Td><Td><DifficultyBadge level="medium" /></Td><Td numeric>41.0%</Td></Tr>
        </TBody>
      </Table>
      <Panel>
        <Tabs defaultValue="a">
          <TabsList><TabsTrigger value="a">Description</TabsTrigger><TabsTrigger value="b">Submissions</TabsTrigger></TabsList>
          <TabsContent value="a"><PanelBody>Description tab content.</PanelBody></TabsContent>
          <TabsContent value="b"><PanelBody>Submissions tab content.</PanelBody></TabsContent>
        </Tabs>
      </Panel>
      <div className="grid gap-4 sm:grid-cols-2">
        <CodeBlock label="Expected output">{'3\n5\n8'}</CodeBlock>
        <div className="space-y-3"><Progress value={64} label="XP" /><div className="flex items-center gap-2"><Avatar name="Ada" /><span>Ada Lovelace</span></div><Skeleton className="h-4 w-1/2" /></div>
      </div>
      <TableSkeleton rows={3} />
      <EmptyState icon={Inbox} title="No submissions yet" description="Solve a problem to see your history here." action={<Button variant="primary" to="/problems">Browse problems</Button>} />
      <ErrorState message="Could not load problems. Check your connection and try again." onRetry={() => {}} />
      <div className="flex gap-3">
        <Button onClick={() => setOpen(true)}>Open modal</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button>Menu</Button></DropdownMenuTrigger>
          <DropdownMenuContent><DropdownMenuItem>Profile</DropdownMenuItem><DropdownMenuItem>Log out</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Modal open={open} onOpenChange={setOpen} title="Delete problem" description="This cannot be undone." footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger">Delete</Button></>}>
        <p>The problem and its test cases will be removed.</p>
      </Modal>
    </div>
  );
}
