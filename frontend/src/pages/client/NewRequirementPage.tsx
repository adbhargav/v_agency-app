import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, FolderKanban, Layers, Send } from 'lucide-react';
import { useCreateRequirement, useProjects, useServiceTypes } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { cn, todayISO } from '../../lib/format';
import { PrioritySelect } from '../../components/PriorityBadge';
import {
  DynamicForm,
  serverErrorsToFields,
  toAnswersPayload,
  validateDynamicForm,
  type FormErrors,
  type FormValues,
} from '../../components/DynamicForm';
import { EmptyState, ErrorState, Field, PageHeader, Skeleton, Spinner } from '../../components/ui';
import type { Priority } from '../../types';

export default function NewRequirementPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const { data: projects, isLoading: loadingProjects } = useProjects();
  const { data: services, isLoading: loadingServices, error: servicesError } = useServiceTypes();
  const create = useCreateRequirement();

  const activeProjects = useMemo(() => (projects ?? []).filter((p) => p.status === 'active'), [projects]);
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  const [serviceId, setServiceId] = useState(params.get('service') ?? '');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [desiredDate, setDesiredDate] = useState('');
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Preselect when there's only one choice.
  useEffect(() => {
    if (!projectId && activeProjects.length === 1) setProjectId(activeProjects[0]!.id);
  }, [activeProjects, projectId]);
  useEffect(() => {
    if (!serviceId && services?.length === 1) setServiceId(services[0]!.id);
  }, [services, serviceId]);

  const service = services?.find((s) => s.id === serviceId);
  const fields = service?.fields ?? [];

  // Editing a field clears its error; the banner goes once nothing is left to fix.
  const clearErrors = (...keys: string[]) =>
    setErrors((e) => {
      if (!keys.some((k) => k in e)) return e;
      const n = { ...e };
      keys.forEach((k) => delete n[k]);
      if (!Object.keys(n).length) setFormError(null);
      return n;
    });
  const onValues = (next: FormValues) => {
    clearErrors(...Object.keys(next).filter((k) => next[k] !== values[k]));
    setValues(next);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errs: FormErrors = validateDynamicForm(fields, values);
    if (!projectId) errs._project = 'Choose a project';
    if (!serviceId) errs._service = 'Choose a service';
    if (!title.trim()) errs._title = 'Give your requirement a short title';
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError('Please fix the highlighted fields.');
      window.setTimeout(() => document.querySelector('[data-invalid="true"], .text-rose-600')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
      return;
    }
    create.mutate(
      {
        projectId,
        serviceTypeId: serviceId,
        title: title.trim(),
        priority,
        desiredDate: desiredDate || undefined,
        answers: toAnswersPayload(fields, values),
      },
      {
        onSuccess: (r) => {
          toast('Requirement submitted — we will review it shortly');
          navigate(`/client/requirements/${r.id}`, { replace: true });
        },
        onError: (err) => {
          const mapped = serverErrorsToFields(fields, err);
          setErrors(mapped);
          setFormError(errorMessage(err));
        },
      },
    );
  };

  if (loadingProjects || loadingServices)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl" noValidate>
      <Link to="/client/requirements" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Requirements
      </Link>
      <PageHeader title="New requirement" subtitle="Share your brief, references and files — the more detail, the better the result." />
      {servicesError && <ErrorState error={servicesError} />}

      <div className="space-y-6">
        <Step n={1} title="Project" icon={<FolderKanban className="size-4" />} error={errors._project}>
          {activeProjects.length === 0 ? (
            <EmptyState title="No active projects" description="Ask your V Agency contact to set up a project first." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {activeProjects.map((p) => (
                <SelectCard
                  key={p.id}
                  selected={projectId === p.id}
                  onClick={() => {
                    if (p.id === projectId) return;
                    setProjectId(p.id);
                    clearErrors('_project');
                    // Uploaded files belong to the previous project's folder; drop them.
                    setValues((v) => Object.fromEntries(Object.entries(v).filter(([k]) => fields.find((f) => f.id === k)?.type !== 'file')));
                  }}
                >
                  <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                  {p.description && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{p.description}</p>}
                </SelectCard>
              ))}
            </div>
          )}
        </Step>

        <Step n={2} title="Service" icon={<Layers className="size-4" />} error={errors._service}>
          {!services?.length ? (
            <EmptyState title="No services available" description="Please contact your V Agency account manager." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {services.map((s) => (
                <SelectCard
                  key={s.id}
                  selected={serviceId === s.id}
                  onClick={() => {
                    setServiceId(s.id);
                    setErrors({});
                    setFormError(null);
                  }}
                  accent={s.color}
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="truncate">{s.name}</span>
                  </p>
                  {s.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{s.description}</p>}
                </SelectCard>
              ))}
            </div>
          )}
        </Step>

        {service && (
          <Step n={3} title="Details" icon={<Send className="size-4" />}>
            <div className="card space-y-5 p-4 sm:p-5">
              <Field label="Title">
                <input
                  className={cn('input', errors._title && 'border-rose-300')}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    clearErrors('_title');
                  }}
                  placeholder={`e.g. ${service.name} for the spring campaign`}
                  maxLength={200}
                />
                {errors._title && <span className="mt-1 block text-xs text-rose-600">{errors._title}</span>}
              </Field>
              <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <div>
                  <span className="label">Priority</span>
                  <PrioritySelect value={priority} onChange={setPriority} />
                </div>
                <Field label="Desired date (optional)">
                  <input type="date" className="input" min={todayISO()} value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} />
                </Field>
              </div>
              <div className="border-t border-slate-100 pt-5">
                <p className="mb-4 text-sm font-semibold text-slate-800">{service.name} brief</p>
                <DynamicForm fields={fields} values={values} onChange={onValues} errors={errors} projectId={projectId || undefined} onBusyChange={setUploading} />
              </div>
            </div>
          </Step>
        )}

        {formError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}

        <div className="pb-safe sticky bottom-20 z-10 flex items-center justify-end gap-2 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-lg backdrop-blur lg:bottom-4">
          {uploading && <span className="mr-auto text-xs text-slate-500">Waiting for uploads to finish…</span>}
          <Link to="/client/requirements" className="btn-ghost">
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={create.isPending || uploading || !service}>
            {create.isPending ? <Spinner /> : <Send className="size-4" />} Submit requirement
          </button>
        </div>
      </div>
    </form>
  );
}

function Step({ n, title, icon, error, children }: { n: number; title: string; icon: ReactNode; error?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{n}</span>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <span className="text-slate-400">{icon}</span>
          {title}
        </h2>
        {error && <span className="ml-auto text-xs text-rose-600">{error}</span>}
      </div>
      {children}
    </section>
  );
}

function SelectCard({ selected, onClick, children, accent }: { selected: boolean; onClick: () => void; children: ReactNode; accent?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'relative min-w-0 rounded-2xl border bg-white p-3.5 pr-9 text-left shadow-card transition',
        selected ? 'border-brand-400 ring-4 ring-brand-100' : 'border-slate-200 hover:border-brand-200 hover:shadow-md',
      )}
      style={selected && accent ? { borderColor: accent, boxShadow: `0 0 0 4px ${accent}22` } : undefined}
    >
      {children}
      {selected && (
        <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-brand-600 text-white" style={accent ? { background: accent } : undefined}>
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
