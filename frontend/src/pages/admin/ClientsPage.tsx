import { useState, type FormEvent } from 'react';
import { Building2, FolderKanban, KeyRound, Mail, Phone, Plus, UserPlus } from 'lucide-react';
import { useClients, useCreateClient, useCreateUser, useUpdateUser, useUsers } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Avatar, EmptyState, ErrorState, Field, Modal, PageHeader, SkeletonList, Spinner, Toggle } from '../../components/ui';
import { ResetPasswordModal } from './TeamPage';
import type { Client, User } from '../../types';

export default function ClientsPage() {
  const { data: clients, isLoading, error, refetch } = useClients();
  const { data: clientUsers } = useUsers('client');
  const update = useUpdateUser();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [loginFor, setLoginFor] = useState<Client | null>(null);
  const [resetFor, setResetFor] = useState<User | null>(null);

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Client organisations and their portal logins"
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New client
          </button>
        }
      />
      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <SkeletonList />
      ) : !clients?.length ? (
        <EmptyState icon={<Building2 className="size-5" />} title="No clients yet" description="Add a client organisation, then create a login for them." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => {
            const logins = (clientUsers ?? []).filter((u) => u.clientId === c.id);
            return (
              <div key={c.id} className="card flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-50 to-brand-100 text-brand-600">
                    <Building2 className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{c.name}</p>
                    {c.company && <p className="truncate text-sm text-slate-500">{c.company}</p>}
                  </div>
                  <span className="chip bg-slate-100 text-slate-600">
                    <FolderKanban className="size-3" /> {c.projectCount}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  {c.email && (
                    <p className="flex items-center gap-1.5 truncate">
                      <Mail className="size-3.5" /> {c.email}
                    </p>
                  )}
                  {c.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="size-3.5" /> {c.phone}
                    </p>
                  )}
                </div>
                <div className="mt-4 flex-1 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Portal logins</p>
                  {logins.length === 0 ? (
                    <p className="text-xs text-slate-400">No login yet</p>
                  ) : (
                    <ul className="space-y-2">
                      {logins.map((u) => (
                        <li key={u.id} className="flex items-center gap-2">
                          <Avatar name={u.name} className="size-6 text-[10px]" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-slate-700">{u.name}</p>
                            <p className="truncate text-[11px] text-slate-400">{u.email}</p>
                          </div>
                          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setResetFor(u)} aria-label="Reset password" title="Reset password">
                            <KeyRound className="size-3.5" />
                          </button>
                          <Toggle
                            checked={u.isActive}
                            label="Active"
                            onChange={(v) => update.mutate({ id: u.id, isActive: v }, { onError: (e) => toast(errorMessage(e), 'error') })}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button className="btn-secondary mt-4" onClick={() => setLoginFor(c)}>
                  <UserPlus className="size-4" /> Add client login
                </button>
              </div>
            );
          })}
        </div>
      )}
      <CreateClientModal open={creating} onClose={() => setCreating(false)} />
      <ClientLoginModal client={loginFor} onClose={() => setLoginFor(null)} />
      <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />
    </div>
  );
}

function CreateClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateClient();
  const toast = useToast();
  const empty = { name: '', company: '', email: '', phone: '' };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Name is required.');
    create.mutate(
      { name: form.name.trim(), company: form.company.trim() || undefined, email: form.email.trim() || undefined, phone: form.phone.trim() || undefined },
      {
        onSuccess: () => {
          toast('Client created');
          setForm(empty);
          setError(null);
          onClose();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New client"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="new-client" className="btn-primary" disabled={create.isPending}>
            {create.isPending && <Spinner />} Create client
          </button>
        </>
      }
    >
      <form id="new-client" onSubmit={submit} className="space-y-4">
        <Field label="Client name">
          <input autoFocus className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Company">
          <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">
            <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
        </div>
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </form>
    </Modal>
  );
}

function ClientLoginModal({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const create = useCreateUser();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!client) return;
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    create.mutate(
      { name: form.name.trim(), email: form.email.trim(), password: form.password, role: 'client', clientId: client.id },
      {
        onSuccess: () => {
          toast('Client login created');
          setForm({ name: '', email: '', password: '' });
          setError(null);
          onClose();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };
  return (
    <Modal
      open={!!client}
      onClose={onClose}
      title={`Client login${client ? ` · ${client.name}` : ''}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="client-login" className="btn-primary" disabled={create.isPending}>
            {create.isPending && <Spinner />} Create login
          </button>
        </>
      }
    >
      <form id="client-login" onSubmit={submit} className="space-y-4">
        <Field label="Contact name">
          <input autoFocus className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <input type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Temporary password">
          <input className="input" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </form>
    </Modal>
  );
}
