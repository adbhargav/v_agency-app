import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Inbox, Layers } from 'lucide-react';
import { useClients, useRequirements, useServiceTypes } from '../../api/hooks';
import { useRequirementDrawer } from '../../lib/useRequirementDrawer';
import { MultiSelect } from '../../components/MultiSelect';
import { ColorDot } from '../../components/ServiceChip';
import { RequirementDrawer, RequirementRow } from '../../components/RequirementView';
import { EmptyState, ErrorState, PageHeader, SkeletonList, Tabs } from '../../components/ui';
import type { RequirementDisplayStatus } from '../../types';

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
type TabValue = RequirementDisplayStatus | 'all';
const TABS: { value: TabValue; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'declined', label: 'Declined' },
  { value: 'all', label: 'All' },
];
const EMPTY: Record<TabValue, string> = {
  new: 'No new requirements — the inbox is clear',
  in_progress: 'Nothing in progress',
  completed: 'No completed requirements yet',
  declined: 'No declined requirements',
  all: 'No requirements yet',
};

export default function RequirementsPage() {
  const [params, setParams] = useSearchParams();
  const drawer = useRequirementDrawer();
  const tab = (params.get('tab') as TabValue) || 'new';
  const serviceTypeIds = list(params.get('services'));
  const clientIds = list(params.get('clients'));

  const set = (key: string, value: string | string[] | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        const v = Array.isArray(value) ? value.join(',') : value;
        if (v) n.set(key, v);
        else n.delete(key);
        return n;
      },
      { replace: true },
    );

  const { data: requirements, isLoading, error, refetch } = useRequirements(
    { serviceTypeIds: serviceTypeIds.length ? serviceTypeIds : undefined, clientIds: clientIds.length ? clientIds : undefined },
    { refetchInterval: 60_000 },
  );
  const { data: services } = useServiceTypes({ includeInactive: true });
  const { data: clients } = useClients();

  const counts = useMemo(() => {
    const c: Record<TabValue, number> = { new: 0, in_progress: 0, completed: 0, declined: 0, all: 0 };
    for (const r of requirements ?? []) {
      c[r.displayStatus]++;
      c.all++;
    }
    return c;
  }, [requirements]);
  const shown = (requirements ?? []).filter((r) => tab === 'all' || r.displayStatus === tab);

  return (
    <div>
      <PageHeader title="Requirements" subtitle="Client requests submitted through service forms — turn them into tasks for the right team" />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs value={tab} onChange={(v) => set('tab', v === 'new' ? null : v)} tabs={TABS.map((t) => ({ ...t, count: requirements ? counts[t.value] : undefined }))} />
        <div className="flex flex-col gap-2 sm:flex-row lg:ml-auto">
          <MultiSelect
            label="Services"
            allLabel="All services"
            icon={<Layers className="size-4" />}
            options={(services ?? []).map((s) => ({ value: s.id, label: s.name, icon: <ColorDot color={s.color} /> }))}
            value={serviceTypeIds}
            onChange={(v) => set('services', v)}
          />
          <MultiSelect
            label="Clients"
            allLabel="All clients"
            icon={<Building2 className="size-4" />}
            options={(clients ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={clientIds}
            onChange={(v) => set('clients', v)}
          />
        </div>
      </div>
      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <SkeletonList />
      ) : shown.length === 0 ? (
        <EmptyState icon={<Inbox className="size-5" />} title={EMPTY[tab]} description={tab === 'new' ? 'New client requirements will land here.' : undefined} />
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden">
          {shown.map((r) => (
            <RequirementRow key={r.id} requirement={r} onOpen={() => drawer.open(r.id)} />
          ))}
        </ul>
      )}
      <RequirementDrawer requirementId={drawer.requirementId} onClose={drawer.close} />
    </div>
  );
}
