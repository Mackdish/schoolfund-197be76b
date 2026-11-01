# Self-hosting EduTech on Cloudflare

EduTech is a TanStack Start app. It builds to a Cloudflare-ready server bundle
through Nitro, so it runs on **Cloudflare Pages** or **Cloudflare Workers** —
not as a static site, because it has server-side rendering and server
functions.

## No service role key anywhere

A full audit of the codebase confirmed:

- The browser reads only public values: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (all in the
  repository `.env`). The publishable key is public by design; data protection
  is enforced server-side by row-level security.
- Server functions read only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` —
  the same publishable key, forwarded with each signed-in user's own access
  token.
- **No feature uses the service role key.** The generated
  `src/integrations/supabase/client.server.ts` admin stub exists but is never
  imported. Privileged operations run as SECURITY DEFINER database functions
  that verify the caller's role first. You never need to provision
  `SUPABASE_SERVICE_ROLE_KEY` on your host — don't set it at all.

## Deploy to Cloudflare Pages (from a Git repository)

Connect the project to GitHub/GitLab via Lovable's Git sync first, then:

1. Create a Pages project in Cloudflare and connect it to the repository.
2. **Build settings**
   - Build command: `npm run build`
   - Environment/Node version: **Node.js 22**
   - Build output directory: `dist`
3. **Environment variables** — set before the first build:
   - Build-time (browser bundle):
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_PUBLISHABLE_KEY`
     - `VITE_SUPABASE_PROJECT_ID`
     (copy the values from the repository `.env`)
   - Runtime (server functions) — add under the same project, available to
     the Worker at request time:
     - `SUPABASE_URL`
     - `SUPABASE_PUBLISHABLE_KEY`
   - Do **not** set `SUPABASE_SERVICE_ROLE_KEY` — the app must never need it.
4. Deploy. Each push to the branch Pages builds from redeploys automatically.

## Deploy to Cloudflare Workers (Wrangler)

```bash
npm ci
NITRO_PRESET=cloudflare-module npm run build
npx wrangler deploy
```

Set the runtime variables (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) as
Worker secrets/vars in `wrangler.toml` or via `npx wrangler secret put`, and
build with the `VITE_*` values in the shell so they embed in the client
bundle.

## After the first deploy

1. Open the deployed URL and sign in. If sign-in or password reset redirects
   fail, the new domain is missing from the authentication provider's allowed
   redirect URLs — ask in the Lovable chat to add your Cloudflare domain.
2. If the app uses Google sign-in or other OAuth providers, the new domain
   must be added to their allowed redirect URLs too.
3. Your `*.lovable.app` / existing published URL keeps serving the last
   Lovable-published version independently; publishing from Lovable does not
   affect your Cloudflare deployment.

## Local check before deploying

```bash
git clone <your-repo> && cd <repo>
npm ci
VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... \
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... npm run dev
```

Sign in and exercise a module (e.g. Receipting) — if it works locally with
only the four variables above, it works on Cloudflare.
