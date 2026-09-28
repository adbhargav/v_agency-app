import { FileText } from 'lucide-react';
import { useRequirements } from '../../api/hooks';
import { useRequirementDrawer } from '../../lib/useRequirementDrawer';
import { RequirementDrawer, RequirementRow } from '../../components/RequirementView';
import { EmptyState, ErrorState, PageHeader, SkeletonList } from '../../components/ui';

/** Client briefs behind the employee's tasks (the API only returns requirements linked to their tasks). */
export default function BriefsPage() {
  const drawer = useRequirementDrawer();
  const { data, isLoading, error, refetch } = useRequirements();
  return (
    <div>
      <PageHeader title="Client briefs" subtitle="The client requirements behind your tasks — answers, references and files" />
      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <SkeletonList />
      ) : !data?.length ? (
        <EmptyState icon={<FileText className="size-5" />} title="No briefs yet" description="When you're assigned a task created from a client requirement, its brief shows up here." />
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden">
          {data.map((r) => (
            <RequirementRow key={r.id} requirement={r} onOpen={() => drawer.open(r.id)} />
          ))}
        </ul>
      )}
      <RequirementDrawer requirementId={drawer.requirementId} onClose={drawer.close} />
    </div>
  );
}
