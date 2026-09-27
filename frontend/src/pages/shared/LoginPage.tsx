import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { Spinner } from '../../components/ui';
import { homeFor } from '../../lib/roles';
import { LogoMark, Wordmark } from '../../components/Logo';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const u = await login(email.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      const home = homeFor(u.role);
      navigate(from && from !== '/' && from.startsWith(home) ? from : home, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      <div className="pointer-events-none absolute -left-40 -top-40 size-[32rem] rounded-full bg-brand-600/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 size-[32rem] rounded-full bg-amber-500/20 blur-3xl" />
      <div className="animate-slide-up relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="size-24 drop-shadow-[0_12px_30px_rgba(223,47,37,0.45)]" />
          <Wordmark className="mt-4 text-lg text-white" />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-white">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-400">Operations & project management</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-white/10 bg-white/95 p-6 shadow-2xl backdrop-blur sm:p-8">
          <label className="block">
            <span className="label">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input type="email" autoComplete="email" required autoFocus className="input !pl-9" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
          </label>
          <label className="block">
            <span className="label">Password</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                required
                className="input !pl-9 !pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-600" aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button type="submit" disabled={pending} className="btn-primary w-full !py-2.5">
            {pending ? <Spinner /> : <ArrowRight className="size-4" />} Sign in
          </button>
        </form>
        {import.meta.env.DEV && (
          <p className="mt-4 text-center text-xs text-slate-500">Dev demo: admin@vagency.com / admin12345 · editor@vagency.com / password123</p>
        )}
      </div>
    </div>
  );
}
