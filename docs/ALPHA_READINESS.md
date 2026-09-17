# Alpha Readiness

| Area | Status | Evidence / required follow-up |
|---|---|---|
| Authentication | PASS | Supabase Auth and authenticated action boundary implemented. |
| Database migrations | PASS | `DATABASE_VALIDATION` applied migrations 1-8 from a clean PostgreSQL container in run `35242996712`. |
| RLS | PASS | Runtime smoke verified anonymous denial, ordinary-user admin denial, and authenticated RPC boundaries. |
| Jobs and crafting | PASS | Unit tests and pgTAP passed in `APP_VALIDATION` and `DATABASE_VALIDATION`. |
| NPC orders and marketplace | PASS | pgTAP suites passed; marketplace coverage remains source-level plus database regression coverage. |
| Property and construction reservations | PASS | Runtime smoke verified construction reservation idempotency; pgTAP passed. |
| Businesses and production reservations | PASS | Runtime smoke verified business slot concurrency/idempotency; pgTAP verified production reservations and claims. |
| Daily quests and achievements | PASS | Source and pgTAP coverage passed in CI. |
| Telemetry and admin tools | PASS | Protected admin RPC coverage passed in pgTAP/runtime validation. |
| Error handling | PASS | Stable client mapping with authoritative reconciliation. |
| Mobile | WARNING | Responsive layouts target 320px upward; manual device/browser pass still recommended before inviting testers. |
| Accessibility | PASS | Labeled buttons, native controls, focusable management UI, and status regions. |
| Backups | WARNING | Procedure documented in `docs/BACKUP_AND_RESTORE.md`; no production data exists for restore rehearsal. |
| Environment variables | PASS | Existing Supabase environment boundary preserved. |
| Public deployment | BLOCKED | Deliberately out of scope. |

## Required Docker-enabled validation

The repository now runs this gate automatically through `.github/workflows/alpha-validation.yml`. The workflow uses only disposable local Supabase credentials generated on the GitHub runner. A private Alpha requires a green workflow run from a clean checkout.

```bash
npx supabase db start
npx supabase db reset
npm run test:integration
npm test
npm run typecheck
npm run lint
npm run build
```

Do not approve Alpha with persistent player data until the complete migration chain and every pgTAP suite pass from an empty database. Stress-test both reservation systems and concurrent claims separately.

## CI infrastructure status

The current external blocker is anonymous Public ECR throttling during `supabase start`. The latest failed GitHub Actions run showed throttling against these Supabase CLI `2.117.0` image references on the Linux runner:

- `public.ecr.aws/supabase/gotrue:v2.196.0`
- `public.ecr.aws/supabase/postgres:15.8.1.085`

The same startup path also requires:

- `public.ecr.aws/supabase/kong:2.8.1`
- `public.ecr.aws/supabase/postgrest:v16.2`
- `public.ecr.aws/supabase/edge-runtime:v1.74.3`

The first split `DATABASE_VALIDATION` run also showed that `supabase db start` under CLI `2.117.0` pulls additional schema-initialization images even before full runtime validation:

- `public.ecr.aws/supabase/realtime:v2.130.0`
- `public.ecr.aws/supabase/storage-api:v1.72.1`
- `public.ecr.aws/supabase/gotrue:v2.196.0`
- `public.ecr.aws/supabase/pg_prove:3.36`

The workflow now pre-pulls trusted exact-version mirrors before Supabase startup and tags them locally with the Public ECR names expected by the CLI:

- `supabase/postgres:15.8.1.085` -> `public.ecr.aws/supabase/postgres:15.8.1.085`
- `supabase/gotrue:v2.196.0` -> `public.ecr.aws/supabase/gotrue:v2.196.0`
- `supabase/realtime:v2.130.0` -> `public.ecr.aws/supabase/realtime:v2.130.0`
- `supabase/storage-api:v1.72.1` -> `public.ecr.aws/supabase/storage-api:v1.72.1`
- `supabase/pg_prove:3.36` -> `public.ecr.aws/supabase/pg_prove:3.36`
- `postgrest/postgrest:v16.2` -> `public.ecr.aws/supabase/postgrest:v16.2`
- `kong:2.8.1` -> `public.ecr.aws/supabase/kong:2.8.1`
- `supabase/edge-runtime:v1.74.3` -> `public.ecr.aws/supabase/edge-runtime:v1.74.3`

The helper prints mirror and expected-image manifest digests where registries expose them. If Public ECR metadata is rate-limited, digest identity may remain unproven for that run; the workflow documents this in logs and continues only with exact version tags from official or Supabase-controlled sources. Docker image archives are cached with a key containing the Supabase CLI version, required service image tags, runner OS, runner architecture, and the database/runtime profile.

## Validation job split

The workflow now reports independent critical jobs:

- `APP_VALIDATION`: unit tests, TypeScript, ESLint, and production build.
- `DATABASE_VALIDATION`: PostgreSQL-only startup, clean reset, complete migration chain, and pgTAP.
- `FULL_RUNTIME_VALIDATION`: minimal Supabase runtime with Postgres, Auth, PostgREST, Kong, and Edge Runtime; clean reset, pgTAP, runtime smoke, RLS/admin checks, idempotency/concurrency smoke, and Edge Function CORS startup check.
- `ALPHA_GATE`: passes only if all critical jobs pass.

Optional local services remain excluded from CI: Realtime, Storage API, imgproxy, Mailpit, Postgres Meta, Studio, Logflare, Vector, and Supavisor.

Authoritative execution status from `Private Alpha Validation` run `35242996712`:

- Migration 7 runtime status: PASS with migration 8 body-local function conflict correction
- pgTAP status: PASS, `Files=6`, `Tests=108`, `Result: PASS`
- Runtime smoke status: PASS
- Concurrency status: PASS for business slot race and construction reservation replay in runtime smoke
- RLS status: PASS for anonymous denial and ordinary-user admin denial in runtime smoke
- Edge Function status: PASS for local function startup and CORS `OPTIONS`

## Private Alpha gate

- **READY** when `Private Alpha Validation` is green on the commit being evaluated.
- Never add production Supabase secrets to this workflow.
- Branch protection should require `APP_VALIDATION`, `DATABASE_VALIDATION`, `FULL_RUNTIME_VALIDATION`, and `ALPHA_GATE`.
- A failed migration, pgTAP assertion, runtime smoke test, Edge Function startup, unit test, typecheck, lint, or build blocks promotion.

## Known issues

- Public ECR may still throttle metadata or image pulls; CI now uses official mirror pre-pull/tagging and Docker archive caching to reduce that dependency.
- Retention percentages are intentionally suppressed until cohorts contain at least five accounts.
- Phaser is isolated in a vendor chunk but remains approximately 1.48 MB; acceptable for Alpha pending real loading telemetry.
- Session duration is approximate because browser close delivery is not guaranteed.
