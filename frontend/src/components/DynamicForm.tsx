import { useEffect, useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, Check, CloudUpload, FileText, RotateCcw, X } from 'lucide-react';
import { uploadFile } from '../api/upload';
import { ApiError, errorMessage, isNotConfigured } from '../api/client';
import { cn, formatBytes } from '../lib/format';
import { fileHref, isImage } from '../lib/files';
import { Toggle } from './ui';
import type { DriveFile, ServiceField } from '../types';

/**
 * Renders a service's custom form (admin-defined fields). Used by the client "New requirement" flow
 * and the admin form-builder live preview, so both always look the same.
 *
 * Form state per type: text/textarea/url/date/select/number → string (number is parsed on submit),
 * multiselect → string[], checkbox → boolean, file → DriveFile[] (uploaded already; ids sent on submit).
 */
export type FormValue = string | boolean | string[] | DriveFile[] | undefined;
export type FormValues = Record<string, FormValue>;
export type FormErrors = Record<string, string>;

type FieldLike = Pick<ServiceField, 'label' | 'type' | 'required' | 'options' | 'helpText'> & { id: string };

const URL_RE = /^https?:\/\/[^\s.]+\.[^\s]+$/i;

function isEmpty(v: FormValue) {
  return v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Client-side validation mirroring the server rules. */
export function validateDynamicForm(fields: FieldLike[], values: FormValues): FormErrors {
  const errors: FormErrors = {};
  for (const f of fields) {
    const v = values[f.id];
    if (f.type === 'checkbox') {
      if (f.required && v !== true) errors[f.id] = 'Please confirm to continue';
      continue;
    }
    if (isEmpty(v)) {
      if (f.required) errors[f.id] = f.type === 'file' ? 'Please upload at least one file' : 'This field is required';
      continue;
    }
    if (f.type === 'number' && !Number.isFinite(Number(v))) errors[f.id] = 'Enter a number';
    if (f.type === 'url' && (typeof v !== 'string' || !URL_RE.test(v.trim()))) errors[f.id] = 'Enter a full link starting with https://';
  }
  return errors;
}

/** Converts form state into the `answers` payload of POST /requirements. Empty answers are omitted. */
export function toAnswersPayload(fields: FieldLike[], values: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.id];
    if (f.type === 'checkbox') {
      if (typeof v === 'boolean') out[f.id] = v;
      continue;
    }
    if (isEmpty(v)) continue;
    if (f.type === 'number') out[f.id] = Number(v);
    else if (f.type === 'file') out[f.id] = (v as DriveFile[]).map((x) => x.id);
    else if (typeof v === 'string') out[f.id] = v.trim();
    else out[f.id] = v;
  }
  return out;
}

/** Maps server validation details ("Brief is required", "Video type: choose one…") back onto fields. */
export function serverErrorsToFields(fields: FieldLike[], error: unknown): FormErrors {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION' || !Array.isArray(error.details)) return {};
  const out: FormErrors = {};
  for (const d of error.details as unknown[]) {
    const msg = typeof d === 'string' ? d : (d as { message?: string })?.message;
    if (!msg) continue;
    const f = [...fields].sort((a, b) => b.label.length - a.label.length).find((x) => msg.startsWith(x.label));
    if (f) out[f.id] = msg.slice(f.label.length).replace(/^[:\s]+/, '') || msg;
  }
  return out;
}

interface FormProps {
  fields: FieldLike[];
  values: FormValues;
  onChange: (values: FormValues) => void;
  errors?: FormErrors;
  /** Required for file uploads; without it (builder preview) the dropzone is disabled. */
  projectId?: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

export function DynamicForm({ fields, values, onChange, errors = {}, projectId, disabled, onBusyChange }: FormProps) {
  const busy = useRef(new Set<string>());
  // Keep the latest values in a ref: uploads finish asynchronously and must not overwrite newer edits.
  const latest = useRef(values);
  latest.current = values;
  if (!fields.length) return <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">This service has no extra questions.</p>;
  return (
    <div className="space-y-5">
      {fields.map((f) => (
        <DynamicFieldInput
          key={f.id}
          field={f}
          value={values[f.id]}
          error={errors[f.id]}
          projectId={projectId}
          disabled={disabled}
          onChange={(v) => onChange({ ...latest.current, [f.id]: v })}
          onBusyChange={(b) => {
            if (b) busy.current.add(f.id);
            else busy.current.delete(f.id);
            onBusyChange?.(busy.current.size > 0);
          }}
        />
      ))}
    </div>
  );
}

interface FieldProps {
  field: FieldLike;
  value: FormValue;
  onChange: (v: FormValue) => void;
  error?: string;
  projectId?: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

export function DynamicFieldInput({ field, value, onChange, error, projectId, disabled, onBusyChange }: FieldProps) {
  const id = `field-${field.id}`;
  const invalid = error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : '';
  const str = typeof value === 'string' ? value : '';
  const label = (
    <span className="label">
      {field.label || <span className="italic text-slate-400">Untitled question</span>}
      {field.required && <span className="ml-0.5 text-brand-600">*</span>}
    </span>
  );

  let control;
  switch (field.type) {
    case 'textarea':
      control = <textarea id={id} className={cn('input min-h-24', invalid)} value={str} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'number':
      control = <input id={id} type="number" inputMode="decimal" className={cn('input', invalid)} value={str} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'date':
      control = <input id={id} type="date" className={cn('input', invalid)} value={str} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'url':
      control = (
        <input id={id} type="url" inputMode="url" placeholder="https://" className={cn('input', invalid)} value={str} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      );
      break;
    case 'select':
      control = (
        <select id={id} className={cn('input', invalid)} value={str} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case 'multiselect': {
      const sel = Array.isArray(value) ? (value as string[]) : [];
      control = (
        <div className="flex flex-wrap gap-2" role="group" aria-label={field.label}>
          {field.options.map((o) => {
            const on = sel.includes(o);
            return (
              <button
                key={o}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => onChange(on ? sel.filter((x) => x !== o) : [...sel, o])}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition',
                  on ? 'border-brand-400 bg-brand-50 font-medium text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {on && <Check className="size-3.5" strokeWidth={3} />}
                {o}
              </button>
            );
          })}
          {field.options.length === 0 && <span className="text-xs text-slate-400">No options yet</span>}
        </div>
      );
      break;
    }
    case 'checkbox':
      return (
        <div>
          <div className={cn('flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5', error ? 'border-rose-300' : 'border-slate-200')}>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">
                {field.label || <span className="italic text-slate-400">Untitled question</span>}
                {field.required && <span className="ml-0.5 text-brand-600">*</span>}
              </p>
              {field.helpText && <p className="text-xs text-slate-500">{field.helpText}</p>}
            </div>
            <Toggle checked={value === true} onChange={(v) => onChange(v)} disabled={disabled} label={field.label} />
          </div>
          {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
        </div>
      );
    case 'file':
      control = (
        <FileFieldInput
          files={Array.isArray(value) ? (value as DriveFile[]) : []}
          onChange={onChange}
          projectId={projectId}
          disabled={disabled}
          invalid={!!error}
          onBusyChange={onBusyChange}
        />
      );
      break;
    default:
      control = <input id={id} className={cn('input', invalid)} value={str} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  }

  const wrap = field.type === 'multiselect' || field.type === 'file';
  return (
    <div>
      {wrap ? <div>{label}</div> : <label htmlFor={id}>{label}</label>}
      {control}
      {field.helpText && <p className="mt-1 text-xs text-slate-400">{field.helpText}</p>}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- file uploads

interface UploadItem {
  key: number;
  file: File;
  progress: number;
  status: 'uploading' | 'error';
  error?: string;
  preview?: string;
  abort: AbortController;
}
let seq = 0;

function FileFieldInput({
  files,
  onChange,
  projectId,
  disabled,
  invalid,
  onBusyChange,
}: {
  files: DriveFile[];
  onChange: (f: DriveFile[]) => void;
  projectId?: string;
  disabled?: boolean;
  invalid?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [drag, setDrag] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  // Uploads resolve out of order; keep the latest list so none are lost.
  const current = useRef(files);
  current.current = files;
  const canUpload = !!projectId && !disabled && !notConfigured;

  const uploading = items.some((i) => i.status === 'uploading');
  useEffect(() => onBusyChange?.(uploading), [uploading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => items.forEach((i) => i.preview && URL.revokeObjectURL(i.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (list: FileList | File[]) => {
    if (!projectId) return;
    for (const file of Array.from(list)) {
      const item: UploadItem = {
        key: ++seq,
        file,
        progress: 0,
        status: 'uploading',
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        abort: new AbortController(),
      };
      setItems((l) => [...l, item]);
      const patch = (p: Partial<UploadItem>) => setItems((l) => l.map((x) => (x.key === item.key ? { ...x, ...p } : x)));
      uploadFile({ projectId, file, purpose: 'requirement', signal: item.abort.signal, onProgress: (p) => patch({ progress: p }) })
        .then((saved) => {
          onChange([...current.current, saved]);
          setItems((l) => l.filter((x) => x.key !== item.key));
          if (item.preview) URL.revokeObjectURL(item.preview);
        })
        .catch((e) => {
          if (isNotConfigured(e)) {
            setNotConfigured(true);
            setItems((l) => l.filter((x) => x.key !== item.key));
          } else patch({ status: 'error', error: errorMessage(e) });
        });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (canUpload && e.dataTransfer.files.length) start(e.dataTransfer.files);
  };

  return (
    <div className="space-y-2">
      {notConfigured ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Google Drive not configured</p>
            <p className="text-xs opacity-90">File uploads aren't available yet. You can still submit — share links in the brief instead.</p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={!canUpload}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (canUpload) setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm transition disabled:cursor-not-allowed disabled:opacity-60',
            drag ? 'border-brand-400 bg-brand-50 text-brand-700' : invalid ? 'border-rose-300 bg-rose-50/40 text-slate-500' : 'border-slate-200 bg-white text-slate-500 hover:border-brand-300',
          )}
        >
          <CloudUpload className="size-5" />
          <span className="font-medium">{projectId ? 'Drag & drop files, or tap to browse' : 'File upload (disabled in preview)'}</span>
          <span className="text-xs text-slate-400">Images, videos, PDFs — multiple files allowed</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) start(e.target.files);
          e.target.value = '';
        }}
      />

      {(files.length > 0 || items.length > 0) && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {files.map((f) => {
            const href = fileHref(f);
            return (
              <li key={f.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2">
                {isImage(f) && href ? (
                  <img src={href} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <FileText className="size-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-700">{f.name}</p>
                  <p className="flex items-center gap-1 text-[11px] text-emerald-600">
                    <Check className="size-3" /> Uploaded{f.size ? ` · ${formatBytes(f.size)}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => onChange(current.current.filter((x) => x.id !== f.id))}
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
          {items.map((u) => (
            <li key={u.key} className={cn('flex items-center gap-2.5 rounded-xl border bg-white p-2', u.status === 'error' ? 'border-rose-200' : 'border-slate-200')}>
              {u.preview ? (
                <img src={u.preview} alt="" className="size-10 shrink-0 rounded-lg object-cover opacity-70" />
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <CloudUpload className="size-4" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-slate-700">{u.file.name}</span>
                  <span className="shrink-0 text-slate-500">{u.status === 'error' ? 'Failed' : `${Math.round(u.progress * 100)}%`}</span>
                </div>
                {u.status === 'error' ? (
                  <p className="truncate text-[11px] text-rose-600" title={u.error}>
                    {u.error}
                  </p>
                ) : (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                  </div>
                )}
              </div>
              {u.status === 'error' && (
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Retry upload"
                  onClick={() => {
                    setItems((l) => l.filter((x) => x.key !== u.key));
                    start([u.file]);
                  }}
                >
                  <RotateCcw className="size-4" />
                </button>
              )}
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cancel upload"
                onClick={() => {
                  if (u.status === 'uploading') u.abort.abort();
                  if (u.preview) URL.revokeObjectURL(u.preview);
                  setItems((l) => l.filter((x) => x.key !== u.key));
                }}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
