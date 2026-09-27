import { cn } from '../lib/format';

/** The V Agency "V" mark (transparent PNG cropped from the brand logo). */
export function LogoMark({ className }: { className?: string }) {
  return <img src="/logo-mark.png" alt="V Agency" draggable={false} className={cn('shrink-0 select-none object-contain', className)} />;
}

/** Letter-spaced wordmark matching the brand logo's "V AGENCY" lettering. */
export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('font-bold uppercase tracking-[0.35em]', className)}>V Agency</span>;
}
