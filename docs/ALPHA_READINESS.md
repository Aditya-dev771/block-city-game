# Alpha Readiness

| Area | Status | Evidence / required follow-up |
|---|---|---|
| Authentication | PASS | Supabase Auth and authenticated action boundary implemented. |
| Database migrations | BLOCKED | Awaiting green `DATABASE_VALIDATION` after registry mitigation; migration 7 must execute from a clean PostgreSQL container. |
| RLS | NEEDS TESTING | Policies and admin guards exist; runtime and pgTAP must pass in CI. |
| Jobs and crafting | PASS | Unit-tested; PostgreSQL regression remains blocked. |
| NPC orders and marketplace | NEEDS TESTING | Source and pgTAP coverage present. |
| Property and construction reservations | NEEDS TESTING | High-risk concurrent PostgreSQL paths require CI runtime evidence. |
| Businesses and production reservations | NEEDS TESTING | Source-complete; runtime/concurrency validation remains blocked until CI is green. |
| Daily quests and achievements | NEEDS TESTING | Source and pgTAP coverage present. |
| Telemetry and admin tools | NEEDS TESTING | Protected RPC and `/admin/economy` implemented. |
| Error handling | PASS | Stable client mapping with authoritative reconciliation. |
| Mobile | NEEDS TESTING | Responsive layouts target 320px upward; device/browser pass required. |
| Accessibility | PASS | Labeled buttons, native controls, focusable management UI, and status regions. |
| Backups | NEEDS TESTING | Procedure documented in `docs/BACKUP_AND_RESTORE.md`. |
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

Current execution status remains **BLOCKED** until the updated workflow runs green:

- Migration 7 runtime status: FAILED ON UNSUPPORTED FUNCTION GUC; migration 8 added for body-local conflict correction
- pgTAP status: NEEDS TESTING
- Runtime smoke status: NEEDS TESTING
- Concurrency status: NEEDS TESTING
- RLS status: NEEDS TESTING
- Edge Function status: NEEDS TESTING

## Private Alpha gate

- **BLOCKED** until `Private Alpha Validation` is green.
- Never add production Supabase secrets to this workflow.
- Branch protection should require `APP_VALIDATION`, `DATABASE_VALIDATION`, `FULL_RUNTIME_VALIDATION`, and `ALPHA_GATE`.
- A failed migration, pgTAP assertion, runtime smoke test, Edge Function startup, unit test, typecheck, lint, or build blocks promotion.

## Known issues

- PostgreSQL migrations 3–7 have not yet completed in the updated authoritative CI gate.
- Public ECR may still throttle metadata or image pulls; CI now uses official mirror pre-pull/tagging and Docker archive caching to reduce that dependency.
- Retention percentages are intentionally suppressed until cohorts contain at least five accounts.
- Phaser is isolated in a vendor chunk but remains approximately 1.48 MB; acceptable for Alpha pending real loading telemetry.
- Session duration is approximate because browser close delivery is not guaranteed.
