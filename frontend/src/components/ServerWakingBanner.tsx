import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { onServerSlow } from '../api/client';

/** Shown while any request takes unusually long, e.g. while a sleeping server starts up. */
export function ServerWakingBanner() {
  const [slow, setSlow] = useState(false);
  useEffect(() => onServerSlow(setSlow), []);
  if (!slow) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-slide-up fixed inset-x-0 bottom-20 z-[60] mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2.5 rounded-full bg-slate-900/95 px-4 py-2.5 text-sm text-white shadow-lg lg:bottom-6"
    >
      <Loader2 className="size-4 shrink-0 animate-spin text-brand-300" />
      <span>Waking up the server… the first load after a break can take up to a minute.</span>
    </div>
  );
}
