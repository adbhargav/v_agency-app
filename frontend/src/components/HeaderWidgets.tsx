import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../context/AuthContext';
import { Bell, CheckCheck, Pause } from 'lucide-react';
import { useActiveTimer, useNotificationMutations, useNotifications, useTimerControl } from '../api/hooks';
import { useTaskDrawer } from '../lib/useTaskDrawer';
import { useNow } from '../lib/useNow';
import { cn, formatDuration, relativeTime } from '../lib/format';
import { Skeleton } from './ui';
import type { Notification } from '../types';

export function ActiveTimerIndicator() {
  const { data: timer } = useActiveTimer();
  const { pause } = useTimerControl();
  const drawer = useTaskDrawer();
  const now = useNow(!!timer);
  if (!timer) return null;
  const secs = (now - new Date(timer.startedAt).getTime()) / 1000;
  return (
    <div className="animate-fade-in flex items-center gap-1 rounded-full bg-emerald-50 py-1 pl-1 pr-1 ring-1 ring-emerald-200">
      <button onClick={() => drawer.open(timer.taskId)} className="flex min-w-0 items-center gap-2 rounded-full pl-1.5 pr-1 text-left" title={`Timer running: ${timer.taskTitle}`}>
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <span className="hidden max-w-[10rem] truncate text-xs font-medium text-emerald-800 md:inline">{timer.taskTitle}</span>
        <span className="font-mono text-xs font-semibold tabular-nums text-emerald-700">{formatDuration(secs, true)}</span>
      </button>
      <button
        onClick={() => pause.mutate({ id: timer.taskId })}
        disabled={pause.isPending}
        className="flex size-6 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
        aria-label="Pause timer"
      >
        <Pause className="size-3" />
      </button>
    </div>
  );
}


export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const ref = useRef<HTMLDivElement>(null);
  const unread = data?.unreadCount ?? 0;

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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex size-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="animate-slide-up fixed inset-x-3 top-16 z-40 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96">
          <NotificationList compact onNavigate={() => setOpen(false)} />
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-slate-50">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

export function NotificationList({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { data, isLoading } = useNotifications();
  const { markRead, readAll } = useNotificationMutations();
  const drawer = useTaskDrawer();
  const navigate = useNavigate();
  const user = useUser();
  const items = data?.notifications ?? [];
  const shown = compact ? items.slice(0, 8) : items;

  const click = (n: Notification) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.taskId) {
      drawer.open(n.taskId);
      onNavigate?.();
    } else if (n.type.startsWith('requirement_')) {
      navigate(user.role === 'admin' ? '/admin/requirements' : user.role === 'client' ? '/client/requirements' : '/app/briefs');
      onNavigate?.();
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">Notifications</p>
        <button onClick={() => readAll.mutate()} disabled={!data?.unreadCount} className="btn-ghost !px-2 !py-1 text-xs">
          <CheckCheck className="size-3.5" /> Mark all read
        </button>
      </div>
      <div className={cn(compact && 'max-h-[60vh] overflow-y-auto')}>
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">You're all caught up ✨</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((n) => (
              <li key={n.id}>
                <button onClick={() => click(n)} className={cn('flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50', !n.readAt && 'bg-brand-50/40')}>
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : n.priority === 'high' ? 'bg-rose-500' : 'bg-brand-500')} />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', n.readAt ? 'text-slate-600' : 'font-medium text-slate-900')}>
                      {n.priority === 'high' && <span className="mr-1 text-rose-600">●</span>}
                      {n.title}
                    </p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">{relativeTime(n.createdAt)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
