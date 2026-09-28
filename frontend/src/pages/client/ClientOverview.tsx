import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, FilePlus2, FolderKanban, MessageSquareWarning } from 'lucide-react';
import { useClientDashboard } from '../../api/hooks';
import { useUser } from '../../context/AuthContext';
import { ProjectCard } from '../shared/Projects';
import { AssetCard } from './ApprovedAssetsPage';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui';

export default function ClientOverview() {
  const user = useUser();
  const { data, isLoading, error, refetch } = useClientDashboard();
  const pending = data?.actionRequired.length ?? 0;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.name.split(' ')[0]}`}
        subtitle="A bird's-eye view of your projects with V Agency."
        actions={
          <Link to="/client/requirements/new" className="btn-primary">
            <FilePlus2 className="size-4" /> New requirement
          </Link>
        }
      />
      {error && <ErrorState error={error} onRetry={() => refetch()} />}

      {pending > 0 && (
        <Link
          to="/client/actions"
          className="animate-slide-up mb-6 flex items-center gap-4 rounded-2xl bg-gradient-to-r from-brand-700 to-brand-500 p-4 text-white shadow-lift transition hover:brightness-110 sm:p-5"
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-white/15">
            <MessageSquareWarning className="size-5" />
          </span>
          <div className="flex-1">
            <p className="font-semibold">
              {pending} deliverable{pending === 1 ? '' : 's'} waiting for your approval
            </p>
            <p className="text-sm text-white/80">Review, approve, or request a revision.</p>
          </div>
          <ArrowRight className="size-5" />
        </Link>
      )}

      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
        <FolderKanban className="size-4 text-brand-500" /> Projects
      </h2>
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : !data?.projects.length ? (
        <EmptyState title="No projects yet" description="Your projects will appear here once V Agency sets them up." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.projects.map((p) => (
            <ProjectCard key={p.id} project={p} to={`/client/projects/${p.id}`} />
          ))}
        </div>
      )}

      {!!data?.approvedAssets.length && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <BadgeCheck className="size-4 text-emerald-500" /> Latest approved assets
            </h2>
            <Link to="/client/assets" className="text-sm font-medium text-brand-600">
              View library →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.approvedAssets.slice(0, 4).map((f) => (
              <AssetCard key={f.id} file={f} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
