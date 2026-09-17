# Alpha Readiness

| Area | Status | Evidence / required follow-up |
|---|---|---|
| Authentication | PASS | Supabase Auth and authenticated action boundary implemented. |
| Database migrations | BLOCKED | Docker/Podman unavailable; run the commands below from a clean local stack. |
| RLS | NEEDS TESTING | Policies and admin guards exist; pgTAP runtime required. |
| Jobs and crafting | PASS | Unit-tested; PostgreSQL regression remains blocked. |
| NPC orders and marketplace | NEEDS TESTING | Source and pgTAP coverage present. |
| Property and construction reservations | NEEDS TESTING | High-risk concurrent PostgreSQL paths require stress validation. |
| Businesses and production reservations | NEEDS TESTING | Source-complete; runtime/concurrency validation blocked. |
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
npx supabase start
npx supabase db reset
npm run test:integration
npm test
npm run typecheck
npm run lint
npm run build
```

Do not approve Alpha with persistent player data until the complete migration chain and every pgTAP suite pass from an empty database. Stress-test both reservation systems and concurrent claims separately.

## Private Alpha gate

- **BLOCKED** until `Private Alpha Validation` is green.
- Never add production Supabase secrets to this workflow.
- Branch protection should require the `Full Supabase and application gate` job.
- A failed migration, pgTAP assertion, runtime smoke test, Edge Function startup, unit test, typecheck, lint, or build blocks promotion.

## Known issues

- PostgreSQL migrations 3–6 have not run locally.
- Retention percentages are intentionally suppressed until cohorts contain at least five accounts.
- Phaser is isolated in a vendor chunk but remains approximately 1.48 MB; acceptable for Alpha pending real loading telemetry.
- Session duration is approximate because browser close delivery is not guaranteed.
