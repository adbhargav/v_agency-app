import { Link, useNavigate } from 'react-router-dom';
import { FilePlus2 } from 'lucide-react';
import { useRequirements } from '../../api/hooks';
import { RequirementRow } from '../../components/RequirementView';
import { EmptyState, ErrorState, PageHeader, SkeletonList } from '../../components/ui';

export default function ClientRequirementsPage() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useRequirements();
  return (
    <div>
      <PageHeader
        title="Requirements"
        subtitle="Tell us what you need — we'll turn it into work for the right team"
        actions={
          <Link to="/client/requirements/new" className="btn-primary">
            <FilePlus2 className="size-4" /> New requirement
          </Link>
        }
      />
      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <SkeletonList />
      ) : !data?.length ? (
        <EmptyState
          icon={<FilePlus2 className="size-5" />}
          title="No requirements yet"
          description="Submit a requirement with your brief, references and files. You'll see its progress here."
          action={
            <Link to="/client/requirements/new" className="btn-primary">
              <FilePlus2 className="size-4" /> New requirement
            </Link>
          }
        />
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden">
          {data.map((r) => (
            <RequirementRow key={r.id} requirement={r} clientView onOpen={() => navigate(`/client/requirements/${r.id}`)} />
          ))}
        </ul>
      )}
    </div>
  );
}
