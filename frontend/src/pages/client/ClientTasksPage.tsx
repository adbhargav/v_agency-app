import { useClientDashboard } from '../../api/hooks';
import { useTaskDrawer } from '../../lib/useTaskDrawer';
import { TaskList } from '../../components/TaskList';
import { ErrorState, PageHeader, SkeletonList } from '../../components/ui';

export default function ClientTasksPage() {
  const { data, isLoading, error, refetch } = useClientDashboard();
  const drawer = useTaskDrawer();
  return (
    <div>
      <PageHeader title="Active Tasks" subtitle="What the V Agency team is working on for you" />
      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <SkeletonList />
      ) : (
        <TaskList tasks={data?.activeTasks ?? []} onOpen={(t) => drawer.open(t.id)} clientSafe empty="No active tasks right now" />
      )}
    </div>
  );
}
