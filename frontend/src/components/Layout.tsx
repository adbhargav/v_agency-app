import { Suspense, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BadgeCheck,
  Bell,
  Building2,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  MessageSquareWarning,
  Settings,
  SlidersHorizontal,
  SquareKanban,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth, useUser } from '../context/AuthContext';
import { useTaskDrawer } from '../lib/useTaskDrawer';
import { cn } from '../lib/format';
import { ActiveTimerIndicator, NotificationBell } from './HeaderWidgets';
import { TaskDrawer } from './TaskDetail';
import { Avatar, Skeleton } from './ui';
import type { User } from '../types';
import { LogoMark, Wordmark } from './Logo';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export function navFor(user: User): NavItem[] {
  if (user.role === 'admin')
    return [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/admin/tasks', label: 'Tasks', icon: SquareKanban },
      { to: '/admin/projects', label: 'Projects', icon: FolderKanban },
      { to: '/admin/team', label: 'Team', icon: Users },
      { to: '/admin/clients', label: 'Clients', icon: Building2 },
      { to: '/admin/finance', label: 'Finance', icon: Wallet },
      { to: '/admin/eod', label: 'EOD Reports', icon: ClipboardList },
      { to: '/admin/statuses', label: 'Master Statuses', icon: SlidersHorizontal },
      { to: '/notifications', label: 'Notifications', icon: Bell },
      { to: '/settings', label: 'Settings', icon: Settings },
    ];
  if (user.role === 'employee')
    return [
      { to: '/app', label: 'My Board', icon: SquareKanban, end: true },
      { to: '/app/projects', label: 'Projects', icon: FolderKanban },
      { to: '/app/eod', label: 'EOD Update', icon: ClipboardList },
      ...(user.employmentType === 'project_based' ? [{ to: '/app/wallet', label: 'Wallet', icon: Wallet }] : []),
      { to: '/notifications', label: 'Notifications', icon: Bell },
      { to: '/settings', label: 'Settings', icon: Settings },
    ];
  return [
    { to: '/client', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/client/actions', label: 'Action Required', icon: MessageSquareWarning },
    { to: '/client/tasks', label: 'Active Tasks', icon: ListTodo },
    { to: '/client/assets', label: 'Approved Assets', icon: BadgeCheck },
    { to: '/notifications', label: 'Notifications', icon: Bell },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark className="size-10" />
      <div className="leading-tight">
        <Wordmark className="block text-[13px] text-slate-900" />
        <p className="mt-0.5 text-[11px] text-slate-500">Operations</p>
      </div>
    </div>
  );
}

function NavItems({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <nav className="space-y-0.5">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
              isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon className={cn('size-[18px] transition', isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')} />
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function UserFooter() {
  const user = useUser();
  const { logout } = useAuth();
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-2.5">
      <Avatar name={user.name} className="size-8" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{user.name}</p>
        <p className="truncate text-xs capitalize text-slate-500">{user.role === 'employee' ? user.employmentType?.replace('_', '-') ?? 'employee' : user.role}</p>
      </div>
      <button onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-rose-600" aria-label="Log out" title="Log out">
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

export function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function Layout({ children }: { children?: ReactNode }) {
  const user = useUser();
  const items = navFor(user);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const task = useTaskDrawer();
  const location = useLocation();
  // Bottom nav shows the first 4 items; the rest live in the "More" drawer.
  const primary = items.slice(0, 4);
  const current = items.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)));

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200/80 bg-white/80 px-4 py-5 backdrop-blur-xl lg:flex">
        <div className="px-2">
          <Brand />
        </div>
        <div className="mt-8 flex-1 overflow-y-auto">
          <NavItems items={items} />
        </div>
        <UserFooter />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="animate-fade-in absolute inset-0 bg-slate-900/40" onClick={() => setDrawerOpen(false)} />
          <aside className="animate-slide-in-left absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white px-4 py-5 shadow-2xl">
            <div className="flex items-center justify-between px-2">
              <Brand />
              <button onClick={() => setDrawerOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-6 flex-1 overflow-y-auto">
              <NavItems items={items} onNavigate={() => setDrawerOpen(false)} />
            </div>
            <UserFooter />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/75 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button onClick={() => setDrawerOpen(true)} className="-ml-1 rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <p className="truncate text-sm font-semibold text-slate-800 lg:hidden">{current?.label ?? 'V Agency'}</p>
          <div className="ml-auto flex items-center gap-2">
            {user.role !== 'client' && <ActiveTimerIndicator />}
            <NotificationBell />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          <Suspense fallback={<PageFallback />}>
            <div key={location.pathname} className="animate-fade-in">
              {children ?? <Outlet />}
            </div>
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5">
          {primary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition', isActive ? 'text-brand-600' : 'text-slate-500')}
            >
              {({ isActive }) => (
                <>
                  <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition', isActive && 'bg-brand-50')}>
                    <item.icon className="size-5" />
                  </span>
                  <span className="max-w-full truncate px-1">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button onClick={() => setDrawerOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-slate-500">
            <span className="flex h-7 w-12 items-center justify-center">
              <Menu className="size-5" />
            </span>
            More
          </button>
        </div>
      </nav>

      <TaskDrawer taskId={task.taskId} onClose={task.close} />
    </div>
  );
}
