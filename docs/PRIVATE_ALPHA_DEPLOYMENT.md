# Private Alpha Deployment Runbook

Milestone 8 deploys a staging-only Alpha environment. Do not reuse production infrastructure, production credentials, wallets, NFT contracts, token contracts, or treasury systems.

## Required Targets

- Supabase project: `block-city-alpha`
- Environment name: `private-alpha`
- Frontend: private/staging deployment only
- Tester cohort: 10-25 invited testers

## Required Secrets

Configure these in the GitHub Environment named `private-alpha`; do not commit them to the repository.

Frontend-visible inside the deployed browser bundle:

- `ALPHA_SUPABASE_URL` - used by CI as `VITE_SUPABASE_URL` during the Alpha build
- `ALPHA_SUPABASE_ANON_KEY` - used by CI as `VITE_SUPABASE_ANON_KEY` during the Alpha build

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

## Preflight

Current validated source state:

- Commit: `e1cd9694f0b8bb7cdfd35685002f4250fdded7d5`
- Validation workflow: `Private Alpha Validation` run `35373185207`
- Validation result: PASS for `APP_VALIDATION`, `DATABASE_VALIDATION`, `FULL_RUNTIME_VALIDATION`, and `ALPHA_GATE`
- Deployment status: not yet provisioned remotely

Before dispatching the deployment workflow, confirm:

- the Supabase project is dedicated to private Alpha and is not a future production project
- the GitHub `private-alpha` environment exists
- every required secret above is present in that environment
- optional Vercel secrets are present only if `deploy_frontend` will be set to `true`
- no service-role key, database password, or Supabase access token appears in source, build logs, or frontend `VITE_` variables

## Deployment

Use the manually triggered workflow:

`.github/workflows/deploy-private-alpha.yml`

The workflow must run only after `Private Alpha Validation` is green for the same commit. It applies migrations from source, deploys the `game-action` Edge Function, builds the frontend with Alpha environment variables, optionally deploys to Vercel, and runs `npm run alpha:remote-smoke` against the remote Alpha project.

Expected deployment command path:

1. Open GitHub Actions.
2. Select `Deploy Private Alpha`.
3. Run workflow manually on `main`.
4. Set `deploy_frontend` to `true` only after Vercel project secrets are configured for the private/staging target.
5. Confirm the workflow reports the same commit SHA that passed `Private Alpha Validation`.
6. Do not continue to tester invites unless the remote smoke step and frontend deployment both succeed.

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

## Current Blocker

As of commit `e1cd969`, the source repository is deployment-prepared but the real staging environment is not yet validated. Tester invites remain blocked until the dedicated Supabase Alpha project exists, the deployment workflow succeeds against that project, a tester-accessible frontend URL exists, backup evidence is recorded, and browser QA is complete.

## Rollback Conditions

Pause tester access if Alpha shows duplicated Coins/resources, negative balances, reservation loss, double production claims, cross-player access, RLS bypass, admin bypass, duplicate Founder Point claims, migration corruption, or severe auth failures.

## Final Gate

Do not invite testers until deployment validation reports:

`PRIVATE ALPHA DEPLOYMENT READY`

The invite decision report must end with exactly one of:

- `BLOCK PRIVATE ALPHA INVITES`
- `READY TO INVITE PRIVATE ALPHA TESTERS`
