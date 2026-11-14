"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Mail, ArrowRight, Loader2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-bg text-muted">
        <Loader2 className="h-6 w-6 animate-spin text-teal" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: params?.get("callbackUrl") ?? "/today",
      });

      setLoading(false);
      if (res?.error) {
        setError("Invalid email or password.");
        return;
      }
      router.push(res?.url ?? "/overview");
      router.refresh();
    } catch {
      setLoading(false);
      setError("An unexpected error occurred. Please try again.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal to-tealhi font-mono text-xl font-bold text-[#0B0E13] shadow-lg shadow-[#3E8B93]/20">
            TY
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink">TaskBoard OS</h1>
          <p className="text-xs text-muted">Acme Inc · Unified Operating System</p>
        </div>

        {/* Credentials Form */}
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-hover bg-raised p-6 shadow-xl space-y-4"
        >
          <div className="text-xs font-semibold text-muted">
            Sign in to your account
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-muted" htmlFor="email">
              Work Email
            </label>
            <div className="relative mt-1.5">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="w-full rounded-xl border border-hover bg-bg pl-10 pr-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-teal focus:outline-none transition"
                placeholder="name@example.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-muted" htmlFor="password">
              Password
            </label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-xl border border-hover bg-bg pl-10 pr-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-teal focus:outline-none transition"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal to-tealhi py-2.5 text-sm font-semibold text-[#0B0E13] hover:opacity-95 disabled:opacity-50 transition shadow-lg shadow-[#3E8B93]/20"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center text-[11px] text-faint">
          Protected by Acme Security & SSO
        </div>
      </div>
    </div>
  );
}
