import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../lib/format';

export interface Option {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface Props {
  label: string;
  /** Text shown when nothing is selected (e.g. "Entire team"). */
  allLabel: string;
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  icon?: ReactNode;
  single?: boolean;
}

export function MultiSelect({ label, allLabel, options, value, onChange, icon, single }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open]);

  const filtered = useMemo(() => options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())), [options, q]);
  const selected = options.filter((o) => value.includes(o.value));
  const summary =
    selected.length === 0 ? allLabel : selected.length === 1 ? selected[0]!.label : `${selected.length} ${label.toLowerCase()}`;

  const toggle = (v: string) => {
    if (single) {
      onChange(value.includes(v) ? [] : [v]);
      setOpen(false);
    } else onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-xl border bg-white px-3 text-sm shadow-xs transition sm:w-auto',
          value.length ? 'border-brand-300 bg-brand-50/60 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {icon}
        <span className="max-w-[10rem] truncate">{summary}</span>
        {value.length > 0 ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label={`Clear ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            className="ml-auto rounded p-0.5 hover:bg-brand-100"
          >
            <X className="size-3.5" />
          </span>
        ) : (
          <ChevronDown className="ml-auto size-4 opacity-60" />
        )}
      </button>
      {open && (
        <div className="animate-slide-up absolute left-0 z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {options.length > 6 && (
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <Search className="size-4 text-slate-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} className="w-full bg-transparent text-sm outline-none" />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto p-1" role="listbox" aria-multiselectable={!single}>
            <button
              type="button"
              onClick={() => {
                onChange([]);
                if (single) setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <CheckBox on={value.length === 0} />
              {allLabel}
            </button>
            {filtered.map((o) => (
              <button
                type="button"
                key={o.value}
                role="option"
                aria-selected={value.includes(o.value)}
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <CheckBox on={value.includes(o.value)} />
                {o.icon}
                <span className="truncate">{o.label}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-400">No matches</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function CheckBox({ on }: { on: boolean }) {
  return (
    <span className={cn('flex size-4 shrink-0 items-center justify-center rounded border transition', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300')}>
      {on && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}
