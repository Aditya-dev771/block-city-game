# Private Alpha Deployment Runbook

Milestone 8 deploys a staging-only Alpha environment. Do not reuse production infrastructure, production credentials, wallets, NFT contracts, token contracts, or treasury systems.

## Required Targets

- Supabase project: `block-city-alpha`
- Environment name: `private-alpha`
- Frontend: private/staging deployment only
- Tester cohort: 10-25 invited testers

## Required Secrets

Frontend-visible:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server/deployment only:

- `ALPHA_SUPABASE_PROJECT_REF`
- `ALPHA_SUPABASE_ACCESS_TOKEN`
- `ALPHA_SUPABASE_DB_PASSWORD`
- `ALPHA_SUPABASE_URL`
- `ALPHA_SUPABASE_ANON_KEY`
- `ALPHA_SUPABASE_SERVICE_ROLE_KEY`
- Vercel deployment secrets if using Vercel: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`

Never expose service-role keys, database passwords, or access tokens in `VITE_` variables.

## Setup

1. Create a new Supabase project named `block-city-alpha`.
2. Keep services limited to PostgreSQL, Auth, REST/RPC, and Edge Functions.
3. Set Auth signup/email policies appropriate for invite-only Alpha.
4. Add invited tester emails to `public.alpha_invites` after migrations are applied.
5. Promote the intended admin by updating `profiles.app_role = 'admin'` for that account.

## Deployment

Use the manually triggered workflow:

`.github/workflows/deploy-private-alpha.yml`

The workflow must run only after `Private Alpha Validation` is green for the same commit. It applies migrations from source, deploys the `game-action` Edge Function, builds the frontend with Alpha environment variables, optionally deploys to Vercel, and runs `npm run alpha:remote-smoke` against the remote Alpha project.

## Backup

Before inviting testers, take one real staging backup:

```bash
supabase db dump --project-ref "$ALPHA_SUPABASE_PROJECT_REF" --file "backup/private-alpha-$(date -u +%Y%m%dT%H%M%SZ).sql"
```

Record:

- timestamp
- commit SHA
- project ref
- backup file name or storage location
- verification method

Restore rehearsal should target an isolated disposable project, not the active Alpha project.

## Required Verification

- migrations recorded through migration 9
- Edge Function deployed
- frontend points to Alpha Supabase only
- invite-only registration enforced
- remote smoke passes
- RLS spot check passes
- idempotency spot check passes
- limited concurrency spot check passes
- persistence passes
- telemetry/admin health appears
- admin dashboard works
- backup taken
- Chrome desktop QA complete
- Edge desktop QA complete
- Chrome Android or responsive mobile QA complete
- Safari/iPhone QA if available

## Rollback Conditions

Pause tester access if Alpha shows duplicated Coins/resources, negative balances, reservation loss, double production claims, cross-player access, RLS bypass, admin bypass, duplicate Founder Point claims, migration corruption, or severe auth failures.

## Final Gate

Do not invite testers until deployment validation reports:

`PRIVATE ALPHA DEPLOYMENT READY`
