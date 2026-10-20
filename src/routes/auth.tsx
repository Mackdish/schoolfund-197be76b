import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Sign in — EduTech" },
    { name: "description", content: "Sign in to EduTech to access your school treasury console." },
    { property: "og:title", content: "Sign in — EduTech" },
    { property: "og:description", content: "Sign in to EduTech to access your school treasury console." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" }
  ] }),
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if (next) window.location.assign(next);
      else navigate({ to: "/", replace: true });
    }
  }, [loading, user, navigate, next]);


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + (next ?? ""),
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Account created. You are signed in.");
        } else {
          toast.success("Account created. Check your email to confirm, then sign in.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="sf-auth min-h-dvh bg-paper flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 flex items-center gap-3">
          <div className="sf-seal flex h-10 w-10 items-center justify-center">
            <span className="font-serif text-base font-semibold text-brass">ET</span>
          </div>
          <div>
            <h1 className="font-serif text-[22px]">EduTech</h1>
            <p className="text-[11.5px] uppercase tracking-[0.1em] text-ink-soft">Treasury for schools</p>
          </div>
        </div>

        <div className="rounded-[10px] border border-line bg-surface px-4 py-6 sm:px-7">
          <h2 className="font-serif text-[19px]">
            {mode === "signin" ? "Sign in to your console" : "Create your bursar account"}
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-soft">
            Use your school-issued credentials. Audit log records every session.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3.5">
            {mode === "signup" && (
              <Field label="Full name">
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="sf-input"
                  placeholder="James Mwangi"
                />
              </Field>
            )}
            <Field label="Email">
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="sf-input"
                placeholder="bursar@school.ac.ke"
              />
            </Field>
            <Field label="Password">
              <input
                required
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="sf-input"
                placeholder="••••••••"
              />
            </Field>

            <button
              type="submit"
              disabled={busy}
              className="mt-1 w-full rounded-md bg-forest px-4 py-2.5 text-[13.5px] font-medium text-white transition-colors hover:bg-[#163F31] disabled:opacity-60"
            >
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-4 border-t border-line pt-3.5 text-center text-[12.5px] text-ink-soft">
            {mode === "signin" ? (
              <>
                New school?{" "}
                <button onClick={() => setMode("signup")} className="font-medium text-forest underline-offset-2 hover:underline">
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already onboarded?{" "}
                <button onClick={() => setMode("signin")} className="font-medium text-forest underline-offset-2 hover:underline">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`.sf-input{width:100%;border:1px solid var(--color-line-strong, #D5DAD3);background:#fff;border-radius:6px;padding:9px 11px;font-size:13.5px;font-family:inherit;outline:none;}.sf-input:focus{border-color:#1E5640;box-shadow:0 0 0 3px rgba(30,86,64,0.12)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
