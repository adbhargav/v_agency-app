import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ClipboardList, Hourglass, ListChecks } from 'lucide-react';
import { useRequirement } from '../../api/hooks';
import { useTaskDrawer } from '../../lib/useTaskDrawer';
import { DeclinedNotice, RequirementAnswers, RequirementHeader, Section } from '../../components/RequirementView';
import { CompactTaskRow } from '../../components/TaskList';
import { ErrorState, Skeleton } from '../../components/ui';
import type { Requirement } from '../../types';

export default function ClientRequirementDetailPage() {
  const { id } = useParams();
  const { data: r, isLoading, error, refetch } = useRequirement(id);
  const drawer = useTaskDrawer();
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/client/requirements" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Requirements
      </Link>
      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40" />
        </div>
      )}
      {r && (
        <div className="space-y-6">
          <div className="card p-5">
            <RequirementHeader requirement={r} clientView />
          </div>
          <StatusNote requirement={r} />
          <DeclinedNotice requirement={r} />
          {!!r.tasks?.length && (
            <Section icon={<ListChecks className="size-4" />} title="Work in progress">
              <ul className="card divide-y divide-slate-100 overflow-hidden">
                {r.tasks.map((t) => (
                  <CompactTaskRow
                    key={t.id}
                    task={t}
                    clientSafe
                    onOpen={() => drawer.open(t.id)}
                    trailing={<span className="text-xs text-slate-500">{t.percentDone}%</span>}
                  />
                ))}
              </ul>
            </Section>
          )}
          <Section icon={<ClipboardList className="size-4" />} title="Your brief">
            <div className="card p-5">
              <RequirementAnswers requirement={r} />
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function StatusNote({ requirement: r }: { requirement: Requirement }) {
  if (r.displayStatus === 'new')
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800 ring-1 ring-brand-100">
        <Hourglass className="size-4 shrink-0" /> Submitted — our team will review it shortly and get started.
      </p>
    );
  if (r.displayStatus === 'in_progress')
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-800 ring-1 ring-sky-100">
        <Hourglass className="size-4 shrink-0" /> Accepted — our team is working on it.
      </p>
    );
  if (r.displayStatus === 'completed')
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
        <CheckCircle2 className="size-4 shrink-0" /> Completed — find the final files in Approved Assets.
      </p>
    );
  return null;
}
