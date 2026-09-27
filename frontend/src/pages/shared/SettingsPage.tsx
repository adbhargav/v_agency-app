import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarCheck2, CalendarPlus, KeyRound, LogOut, Unplug } from 'lucide-react';
import { connectGoogleCalendar, useChangePassword, useDisconnectCalendar } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import { useAuth, useUser } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Avatar, Field, PageHeader, Spinner } from '../../components/ui';

export default function SettingsPage() {
  const user = useUser();
  const { logout, refresh } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  // Google Calendar OAuth redirects back to /settings?calendar=connected|error
  useEffect(() => {
    const cal = params.get('calendar');
    if (!cal) return;
    if (cal === 'connected') {
      toast('Google Calendar connected');
      refresh().catch(() => {});
    } else toast('Could not connect Google Calendar. Please try again.', 'error');
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('calendar');
        return n;
      },
      { replace: true },
    );
  }, [params, setParams, toast, refresh]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" subtitle="Your profile, security and integrations" />

      <section className="card flex items-center gap-4 p-5">
        <Avatar name={user.name} className="size-14 text-lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-slate-900">{user.name}</p>
          <p className="truncate text-sm text-slate-500">{user.email}</p>
          <p className="mt-1 text-xs capitalize text-slate-400">
            {user.role}
            {user.employmentType ? ` · ${user.employmentType.replace('_', '-')}` : ''}
          </p>
        </div>
        <button className="btn-secondary" onClick={logout}>
          <LogOut className="size-4" /> <span className="hidden sm:inline">Log out</span>
        </button>
      </section>

      {user.role !== 'client' && <CalendarCard />}
      <PasswordCard />
    </div>
  );
}

function CalendarCard() {
  const user = useUser();
  const { refresh } = useAuth();
  const toast = useToast();
  const disconnect = useDisconnectCalendar();
  const [connecting, setConnecting] = useState(false);
  const connected = user.googleCalendarConnected;

  return (
    <section className="card p-5">
      <div className="flex items-start gap-4">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${connected ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-600'}`}>
          {connected ? <CalendarCheck2 className="size-5" /> : <CalendarPlus className="size-5" />}
        </span>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-slate-900">Google Calendar</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {connected
              ? 'Connected. Assigned tasks with due dates sync to your calendar, and moving an event updates the deadline.'
              : 'Connect your calendar so assigned tasks automatically appear with their deadlines.'}
          </p>
          <div className="mt-4">
            {connected ? (
              <button
                className="btn-secondary"
                disabled={disconnect.isPending}
                onClick={() =>
                  disconnect.mutate(undefined, {
                    onSuccess: () => {
                      toast('Google Calendar disconnected');
                      refresh().catch(() => {});
                    },
                    onError: (e) => toast(errorMessage(e), 'error'),
                  })
                }
              >
                {disconnect.isPending ? <Spinner /> : <Unplug className="size-4" />} Disconnect
              </button>
            ) : (
              <button
                className="btn-primary"
                disabled={connecting}
                onClick={async () => {
                  setConnecting(true);
                  try {
                    await connectGoogleCalendar();
                  } catch (e) {
                    toast(errorMessage(e), 'error');
                    setConnecting(false);
                  }
                }}
              >
                {connecting ? <Spinner /> : <CalendarPlus className="size-4" />} Connect Google Calendar
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PasswordCard() {
  const change = useChangePassword();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.newPassword.length < 8) return setError('New password must be at least 8 characters.');
    if (form.newPassword !== form.confirm) return setError('Passwords do not match.');
    change.mutate(
      { currentPassword: form.currentPassword, newPassword: form.newPassword },
      {
        onSuccess: () => {
          toast('Password updated');
          setForm({ currentPassword: '', newPassword: '', confirm: '' });
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-900">Change password</h2>
      </div>
      <Field label="Current password">
        <input type="password" autoComplete="current-password" className="input" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password">
          <input type="password" autoComplete="new-password" className="input" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required />
        </Field>
        <Field label="Confirm new password">
          <input type="password" autoComplete="new-password" className="input" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
        </Field>
      </div>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={change.isPending}>
          {change.isPending && <Spinner />} Update password
        </button>
      </div>
    </form>
  );
}
