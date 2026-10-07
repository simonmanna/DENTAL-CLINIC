// src/pages/auth/LoginPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck, UsersRound, AlertCircle } from 'lucide-react';

function ToothMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 80" fill="none" aria-hidden="true">
      <path
        d="M30 3C17 3 6 12 6 23c0 9 3 16 7 23 4 8 5 18 7 27 1 4 4 6 7 4 2-2 2-8 3-8s1 6 3 8c3 2 6 0 7-4 2-9 3-19 7-27 4-7 7-14 7-23C54 12 43 3 30 3z"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path d="M21 16c-3 2-5 6-5 10" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

const inputClass =
  'w-full rounded-xl border border-sky-300/15 bg-[#0a1f44]/70 px-4 py-3.5 text-[15px] text-white ' +
  'placeholder:text-sky-100/35 outline-none transition-all duration-200 ' +
  'hover:border-sky-300/30 focus:border-sky-400/70 focus:bg-[#0a1f44]/90 focus:ring-4 focus:ring-sky-400/15';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid credentials. Please try again.');
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#071a2e] px-4 py-10">
      {/* ── Backdrop: faint grid + two colour glows ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,197,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(148,197,255,0.6) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-sky-500/20 blur-[120px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -right-40 h-[560px] w-[560px] rounded-full bg-indigo-600/25 blur-[130px]" />

      {/* ── Card ── */}
      <main
        className="login-rise relative z-10 w-full max-w-[460px] rounded-[28px] border border-sky-300/20 p-8 shadow-[0_30px_80px_-20px_rgba(2,12,40,0.8)] backdrop-blur-xl sm:p-10"
        style={{
          background:
            'linear-gradient(160deg, rgba(17,78,122,0.92) 0%, rgba(14,52,110,0.9) 50%, rgba(16,36,110,0.92) 100%)',
        }}
      >
        {/* top sheen */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/50 to-transparent" />

        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-sky-300 shadow-inner">
            <ToothMark className="h-7 w-7" />
          </div>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-wide text-white">Fshikta Dental</p>
            <p className="text-[12px] font-medium text-sky-100/55">Clinic Management</p>
          </div>
        </div>

        <h1 className="text-[30px] font-extrabold leading-tight tracking-[-0.02em] text-white">
          Welcome back
        </h1>
        <p className="mt-1.5 text-[15px] text-sky-100/65">Sign in to your clinic to continue.</p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
          <div>
            <label htmlFor="login-email" className="mb-2 block text-[14px] font-semibold text-sky-50/85">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@clinic.com"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-2 block text-[14px] font-semibold text-sky-50/85">
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className={`${inputClass} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                aria-label={showPass ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-sky-100/50 outline-none transition-colors hover:bg-white/5 hover:text-sky-100 focus-visible:ring-2 focus-visible:ring-sky-400/60"
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-400/30 bg-red-500/10 px-3.5 py-3 text-[13.5px] leading-snug text-red-200"
            >
              <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="group relative mt-1 flex h-[52px] w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl text-[15.5px] font-bold text-white shadow-[0_10px_30px_-8px_rgba(56,189,248,0.6)] outline-none transition-all duration-200 hover:shadow-[0_14px_36px_-8px_rgba(99,102,241,0.7)] focus-visible:ring-4 focus-visible:ring-sky-400/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            style={{ background: 'linear-gradient(100deg, #0ea5e9 0%, #6366f1 55%, #0284c7 100%)' }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full motion-reduce:hidden"
            />
            {isLoading ? (
              <>
                <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              <>
                <LogIn className="h-[18px] w-[18px]" aria-hidden="true" />
                Sign in
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] text-sky-100/55">
          Forgot your password? Ask your clinic administrator to reset it.
        </p>

        <div className="mt-6 flex items-center justify-center gap-5 border-t border-white/10 pt-5 text-[12px] text-sky-100/45">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Secure sign-in
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UsersRound className="h-3.5 w-3.5" aria-hidden="true" />
            Role-based access
          </span>
        </div>
      </main>

      <p className="relative z-10 mt-6 text-[11px] font-medium uppercase tracking-[0.14em] text-sky-100/30">
        © {new Date().getFullYear()} Fshikta Dental
      </p>

      <style>{`
        @keyframes loginRise {
          from { opacity: 0; transform: translateY(18px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .login-rise { animation: loginRise 0.55s cubic-bezier(0.22,1,0.36,1) both; }
        @media (prefers-reduced-motion: reduce) { .login-rise { animation: none; } }
      `}</style>
    </div>
  );
}
