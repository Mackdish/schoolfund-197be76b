import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OAuthResult = { data: any; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Authorize access — EduTech" },
    { name: "description", content: "Review and authorize an assistant connection to your EduTech account." },
    { property: "og:title", content: "Authorize access — EduTech" },
    { property: "og:description", content: "Review and authorize an assistant connection to your EduTech account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" }
  ] }),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(id);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen bg-paper flex items-center justify-center p-6 text-ink">
      Could not load this authorization request: {String((error as Error)?.message ?? error)}
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = details?.client?.name ?? "An app";

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("No redirect returned by the authorization server."); return; }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-[420px] rounded-[10px] border border-line bg-surface px-7 py-6">
        <h1 className="font-serif text-[20px]">Connect {name} to EduTech</h1>
        <p className="mt-2 text-[13px] text-ink-soft">
          {name} will be able to read your school's students, fee balances, payments and funds as you.
        </p>
        {error && <p role="alert" className="mt-3 text-[13px] text-destructive">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button disabled={busy} onClick={() => decide(true)} className="flex-1 rounded-md bg-primary px-4 py-2 text-[13px] text-primary-foreground disabled:opacity-50">Approve</button>
          <button disabled={busy} onClick={() => decide(false)} className="flex-1 rounded-md border border-line px-4 py-2 text-[13px] disabled:opacity-50">Deny</button>
        </div>
      </div>
    </main>
  );
}
