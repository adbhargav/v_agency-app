import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calendar,
  CheckSquare,
  ChevronDown,
  Eye,
  FileUp,
  Hash,
  Inbox,
  Layers,
  Link2,
  List,
  ListChecks,
  Pencil,
  Plus,
  Save,
  Trash2,
  Type,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useServiceTypeMutations, useServiceTypes } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/format';
import { DynamicForm, type FormValues } from '../../components/DynamicForm';
import { SERVICE_COLORS } from '../../components/ServiceChip';
import { EmptyState, ErrorState, Field, PageHeader, Skeleton, Spinner, Toggle } from '../../components/ui';
import type { FieldType, ServiceFieldInput, ServiceType } from '../../types';

export const FIELD_TYPE_META: Record<FieldType, { label: string; icon: LucideIcon }> = {
  text: { label: 'Short text', icon: Type },
  textarea: { label: 'Long text', icon: AlignLeft },
  number: { label: 'Number', icon: Hash },
  date: { label: 'Date', icon: Calendar },
  select: { label: 'Dropdown (one)', icon: List },
  multiselect: { label: 'Multiple choice', icon: ListChecks },
  checkbox: { label: 'Yes / no', icon: CheckSquare },
  url: { label: 'Link (URL)', icon: Link2 },
  file: { label: 'File upload', icon: FileUp },
};
const FIELD_TYPES = Object.keys(FIELD_TYPE_META) as FieldType[];
const hasOptions = (t: FieldType) => t === 'select' || t === 'multiselect';

export default function ServicesPage() {
  const [params, setParams] = useSearchParams();
  const editing = params.get('edit');
  const { data: services, isLoading, error, refetch } = useServiceTypes({ includeInactive: true });
  const setEditing = (v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set('edit', v);
        else n.delete('edit');
        return n;
      },
      { replace: !v },
    );

  if (editing) {
    const service = editing === 'new' ? null : services?.find((s) => s.id === editing);
    if (editing !== 'new' && !service) {
      return isLoading ? <Skeleton className="h-96" /> : <EmptyState title="Service not found" action={<button className="btn-secondary" onClick={() => setEditing(null)}>Back to services</button>} />;
    }
    return <ServiceEditor key={editing} service={service ?? null} onDone={(id) => setEditing(id ?? null)} />;
  }

  return (
    <div>
      <PageHeader
        title="Services"
        subtitle="What you sell, which team does it, and the form clients fill in to request it"
        actions={
          <button className="btn-primary" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> New service
          </button>
        }
      />
      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : !services?.length ? (
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No services yet"
          description="Create a service (e.g. Video Editing) and design the requirement form clients will fill in."
          action={
            <button className="btn-primary" onClick={() => setEditing('new')}>
              <Plus className="size-4" /> New service
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.map((s) => (
            <ServiceCard key={s.id} service={s} onEdit={() => setEditing(s.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceCard({ service: s, onEdit }: { service: ServiceType; onEdit: () => void }) {
  const { update, remove } = useServiceTypeMutations();
  const toast = useToast();
  const used = (s.requirementCount ?? 0) > 0;
  return (
    <div className={cn('card flex flex-col p-5 transition', !s.isActive && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <span className="mt-1.5 size-3 shrink-0 rounded-full" style={{ background: s.color, boxShadow: `0 0 0 4px ${s.color}26` }} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{s.name}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{s.description || 'No description'}</p>
        </div>
        <Toggle
          checked={s.isActive}
          label={`${s.name} active`}
          onChange={(v) =>
            update.mutate(
              { id: s.id, isActive: v },
              { onSuccess: () => toast(v ? `${s.name} is available to clients` : `${s.name} deactivated`), onError: (e) => toast(errorMessage(e), 'error') },
            )
          }
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Stat icon={<ListChecks className="size-3.5" />} label={`${s.fields.length} field${s.fields.length === 1 ? '' : 's'}`} />
        <Stat icon={<Users className="size-3.5" />} label={`${s.memberCount ?? 0} in team`} />
        <Stat icon={<Inbox className="size-3.5" />} label={`${s.requirementCount ?? 0} requirement${s.requirementCount === 1 ? '' : 's'}`} />
        {!s.isActive && <span className="chip bg-slate-100 text-slate-500">Inactive</span>}
      </div>
      <div className="mt-4 flex flex-1 items-end gap-2 border-t border-slate-100 pt-3">
        <button className="btn-secondary flex-1" onClick={onEdit}>
          <Pencil className="size-4" /> Edit form
        </button>
        <button
          className="btn-ghost !px-2.5 !text-rose-600"
          aria-label={`Delete ${s.name}`}
          title={used ? 'This service has requirements — deactivate it instead' : 'Delete service'}
          onClick={() => {
            if (used) {
              toast(`${s.name} already has requirements, so it can't be deleted. Switch it off to hide it from clients instead.`, 'error');
              return;
            }
            if (!window.confirm(`Delete the ${s.name} service and its form?`)) return;
            remove.mutate(s.id, { onSuccess: () => toast('Service deleted'), onError: (e) => toast(errorMessage(e), 'error') });
          }}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

function Stat({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="chip bg-slate-100 text-slate-600">
      {icon}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------- editor / form builder

interface DraftField {
  key: string;
  id?: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  helpText: string;
}
let draftSeq = 0;
const newKey = () => `new-${++draftSeq}`;

function toDraft(s: ServiceType | null) {
  return {
    name: s?.name ?? '',
    description: s?.description ?? '',
    color: s?.color ?? SERVICE_COLORS[0]!,
    fields: (s?.fields ?? []).map<DraftField>((f) => ({
      key: f.id,
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.options,
      helpText: f.helpText ?? '',
    })),
  };
}

function toInput(fields: DraftField[]): ServiceFieldInput[] {
  return fields.map((f) => ({
    id: f.id,
    label: f.label.trim(),
    type: f.type,
    required: f.required,
    options: hasOptions(f.type) ? f.options : [],
    helpText: f.helpText.trim() || null,
  }));
}

function ServiceEditor({ service, onDone }: { service: ServiceType | null; onDone: (editId?: string) => void }) {
  const toast = useToast();
  const { create, update, saveFields } = useServiceTypeMutations();
  const initial = useMemo(() => toDraft(service), [service?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FormValues>({});
  const [showPreview, setShowPreview] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const saving = create.isPending || update.isPending || saveFields.isPending;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  // Warn before losing unsaved changes on reload / tab close.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const setField = (key: string, patch: Partial<DraftField>) =>
    setDraft((d) => ({ ...d, fields: d.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)) }));
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const fields = [...d.fields];
      const j = i + dir;
      if (j < 0 || j >= fields.length) return d;
      [fields[i], fields[j]] = [fields[j]!, fields[i]!];
      return { ...d, fields };
    });
  const addField = (type: FieldType = 'text') => {
    const key = newKey();
    setDraft((d) => ({ ...d, fields: [...d.fields, { key, label: '', type, required: false, options: [], helpText: '' }] }));
    setOpenKey(key);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!draft.name.trim()) e.name = 'Name the service';
    for (const f of draft.fields) {
      if (!f.label.trim()) e[f.key] = 'Every field needs a question / label';
      else if (hasOptions(f.type) && f.options.length === 0) e[f.key] = 'Add at least one option';
    }
    setErrors(e);
    const firstField = draft.fields.find((f) => e[f.key]);
    if (firstField) setOpenKey(firstField.key);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    setServerError(null);
    if (!validate()) return;
    const fields = toInput(draft.fields);
    try {
      if (!service) {
        const created = await create.mutateAsync({
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          color: draft.color,
          fields,
        });
        toast(`${created.name} created`);
        onDone();
        return;
      }
      const meta = { name: draft.name.trim(), description: draft.description.trim() || null, color: draft.color };
      if (meta.name !== initial.name || (meta.description ?? '') !== initial.description || meta.color !== initial.color)
        await update.mutateAsync({ id: service.id, ...meta });
      if (JSON.stringify(draft.fields) !== JSON.stringify(initial.fields)) await saveFields.mutateAsync({ id: service.id, fields });
      toast('Service saved');
      onDone();
    } catch (e) {
      setServerError(errorMessage(e));
    }
  };

  const leave = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onDone();
  };

  const previewFields = draft.fields.map((f) => ({ ...f, id: f.key, helpText: f.helpText || null }));

  return (
    <div>
      <button onClick={leave} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Services
      </button>
      <PageHeader
        title={service ? `Edit ${service.name}` : 'New service'}
        subtitle="Design the requirement form clients fill in when they request this service"
        actions={
          <>
            <button className="btn-secondary lg:hidden" onClick={() => setShowPreview((v) => !v)}>
              <Eye className="size-4" /> {showPreview ? 'Hide preview' : 'Preview'}
            </button>
            <button className="btn-primary" onClick={save} disabled={saving || (!dirty && !!service)}>
              {saving ? <Spinner /> : <Save className="size-4" />} Save
            </button>
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-5">
          <div className="card space-y-4 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Service name">
                <input
                  className={cn('input', errors.name && 'border-rose-300')}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Video Editing"
                />
                {errors.name && <span className="mt-1 block text-xs text-rose-600">{errors.name}</span>}
              </Field>
              <div>
                <span className="label">Color</span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
                  {SERVICE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={draft.color === c}
                      aria-label={c}
                      onClick={() => setDraft({ ...draft, color: c })}
                      className={cn('size-7 rounded-full transition', draft.color === c ? 'ring-2 ring-slate-900 ring-offset-2' : 'hover:scale-110')}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <Field label="Description (shown to clients)">
              <textarea
                className="input min-h-16"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="e.g. Reels, ads, property tours and long-form edits"
              />
            </Field>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Form fields ({draft.fields.length})</h2>
              <button className="btn-secondary !py-1.5 text-xs" onClick={() => addField()}>
                <Plus className="size-3.5" /> Add field
              </button>
            </div>
            {draft.fields.length === 0 ? (
              <EmptyState title="No fields yet" description="Clients will only give a title, priority and date. Add questions to collect a proper brief." />
            ) : (
              <ol className="space-y-3">
                {draft.fields.map((f, i) => (
                  <FieldEditor
                    key={f.key}
                    field={f}
                    index={i}
                    count={draft.fields.length}
                    open={openKey === f.key}
                    onToggle={() => setOpenKey(openKey === f.key ? null : f.key)}
                    error={errors[f.key]}
                    onChange={(p) => setField(f.key, p)}
                    onMove={(dir) => move(i, dir)}
                    onRemove={() => setDraft((d) => ({ ...d, fields: d.fields.filter((x) => x.key !== f.key) }))}
                  />
                ))}
              </ol>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FIELD_TYPES.map((t) => {
                const M = FIELD_TYPE_META[t];
                return (
                  <button key={t} type="button" aria-label={`Add ${M.label} field`} onClick={() => addField(t)} className="chip bg-white py-1 text-slate-600 ring-1 ring-slate-200 hover:text-brand-700 hover:ring-brand-300">
                    <Plus className="size-3" />
                    <M.icon className="size-3.5" /> {M.label}
                  </button>
                );
              })}
            </div>
            {service && service.requirementCount ? (
              <p className="mt-4 text-xs text-slate-500">
                Past requirements keep the questions they were submitted with. Removing a field hides it from new submissions only.
              </p>
            ) : null}
          </div>
          {serverError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{serverError}</p>}
        </div>

        <aside className={cn('lg:sticky lg:top-20', !showPreview && 'hidden lg:block')}>
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <Eye className="size-4 text-slate-400" />
              <p className="flex-1 text-sm font-semibold text-slate-800">Client preview</p>
              <span className="chip text-white" style={{ background: draft.color }}>
                {draft.name || 'Service'}
              </span>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4">
              {draft.description && <p className="mb-4 text-sm text-slate-500">{draft.description}</p>}
              <DynamicForm fields={previewFields} values={preview} onChange={setPreview} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function FieldEditor({
  field: f,
  index,
  count,
  open,
  onToggle,
  error,
  onChange,
  onMove,
  onRemove,
}: {
  field: DraftField;
  index: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  error?: string;
  onChange: (p: Partial<DraftField>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const M = FIELD_TYPE_META[f.type];
  const labelRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open && !f.label) labelRef.current?.focus();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <li className={cn('card overflow-hidden', error && 'border-rose-300 ring-2 ring-rose-100', open && !error && 'ring-2 ring-brand-100')}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500" title={M.label}>
          <M.icon className="size-4" />
        </span>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <p className={cn('truncate text-sm font-medium', f.label ? 'text-slate-800' : 'italic text-slate-400')}>
            {index + 1}. {f.label || 'Untitled question'}
            {f.required && <span className="ml-0.5 text-brand-600">*</span>}
          </p>
          <p className="truncate text-xs text-slate-400">
            {M.label}
            {hasOptions(f.type) ? ` · ${f.options.length} option${f.options.length === 1 ? '' : 's'}` : ''}
            {!f.id && ' · new'}
          </p>
        </button>
        <div className="flex shrink-0 items-center">
          <IconBtn label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="size-4" />
          </IconBtn>
          <IconBtn label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown className="size-4" />
          </IconBtn>
          <IconBtn label="Remove field" onClick={onRemove} danger>
            <Trash2 className="size-4" />
          </IconBtn>
          <IconBtn label={open ? 'Collapse' : 'Expand'} onClick={onToggle}>
            <ChevronDown className={cn('size-4 transition', open && 'rotate-180')} />
          </IconBtn>
        </div>
      </div>
      {open && (
        <div className="space-y-4 border-t border-slate-100 px-3 py-4 sm:px-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <Field label="Question / label">
              <input ref={labelRef} className="input" value={f.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="e.g. Target platforms" />
            </Field>
            <Field label="Type">
              <select className="input" value={f.type} onChange={(e) => onChange({ type: e.target.value as FieldType })}>
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_META[t].label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Help text (optional)">
            <input className="input" value={f.helpText} onChange={(e) => onChange({ helpText: e.target.value })} placeholder="A hint shown under the field" />
          </Field>
          {hasOptions(f.type) && <OptionsEditor options={f.options} onChange={(options) => onChange({ options })} />}
          <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <span className="text-sm text-slate-700">
              Required
              <span className="block text-xs text-slate-400">{f.type === 'checkbox' ? 'The client must switch it on to submit' : 'Clients must answer before submitting'}</span>
            </span>
            <Toggle checked={f.required} onChange={(required) => onChange({ required })} label="Required" />
          </label>
        </div>
      )}
      {error && <p className="border-t border-rose-100 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{error}</p>}
    </li>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn('rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 disabled:opacity-30', danger ? 'hover:text-rose-600' : 'hover:text-slate-700')}
    >
      {children}
    </button>
  );
}

function OptionsEditor({ options, onChange }: { options: string[]; onChange: (o: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    // Pasting several lines adds one option per line.
    const next = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s, i, a) => a.indexOf(s) === i && !options.includes(s));
    if (next.length) onChange([...options, ...next]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && options.length) onChange(options.slice(0, -1));
  };
  return (
    <div>
      <span className="label">Options</span>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100">
        {options.map((o) => (
          <span key={o} className="chip bg-brand-50 py-1 text-brand-700">
            {o}
            <button type="button" aria-label={`Remove ${o}`} onClick={() => onChange(options.filter((x) => x !== o))}>
              <X className="size-3.5 opacity-60 hover:opacity-100" />
            </button>
          </span>
        ))}
        <input
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-slate-400"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => draft.trim() && add(draft)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (text.includes('\n')) {
              e.preventDefault();
              add(text);
            }
          }}
          placeholder={options.length ? 'Add another…' : 'Type an option and press Enter'}
        />
      </div>
      <p className="mt-1 text-xs text-slate-400">Press Enter after each option, or paste a list (one per line).</p>
    </div>
  );
}
