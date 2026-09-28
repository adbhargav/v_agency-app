import { Check } from 'lucide-react';
import { useServiceTypes } from '../api/hooks';
import { cn } from '../lib/format';

/** Toggle-chip multi-select of services / teams (active ones, plus any already selected). */
export function ServicePicker({ value, onChange, emptyHint }: { value: string[]; onChange: (v: string[]) => void; emptyHint?: string }) {
  const { data: services, isLoading } = useServiceTypes({ includeInactive: true });
  const list = (services ?? []).filter((s) => s.isActive || value.includes(s.id));
  if (isLoading) return <p className="text-xs text-slate-400">Loading services…</p>;
  if (!list.length) return <p className="text-xs text-slate-400">No services defined yet — add them under Services.</p>;
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group">
        {list.map((s) => {
          const on = value.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== s.id) : [...value, s.id])}
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition', on ? 'font-medium' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}
              style={on ? { borderColor: s.color, background: `${s.color}14`, color: s.color } : undefined}
            >
              {on ? <Check className="size-3.5" strokeWidth={3} /> : <span className="size-2 rounded-full" style={{ background: s.color }} />}
              {s.name}
            </button>
          );
        })}
      </div>
      {emptyHint && value.length === 0 && <p className="mt-1.5 text-xs text-slate-400">{emptyHint}</p>}
    </div>
  );
}
