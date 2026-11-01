<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep compact-screen presentation in the shared shell, UI primitives, and screen-only CSS; financial tables scroll with all columns intact so printed templates remain unchanged.
- Never use the service role key (`supabaseAdmin` / `SUPABASE_SERVICE_ROLE_KEY`) in any feature code — the app is deployed self-hosted where that key must not exist. Privileged work goes through SECURITY DEFINER database functions whose handlers verify the caller's role via the authenticated client; the only server env reads allowed are `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
- Keep the app deployable outside Lovable on Cloudflare (Nitro cloudflare preset): no Lovable-only runtime dependencies in server code; every secret read lives inside a server-only boundary (`createServerFn` handler or server route).
