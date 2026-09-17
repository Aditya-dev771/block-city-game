# Founding Era

A mobile-first browser economy game foundation. Phaser renders the town and resident; React renders account and management UI; Supabase/PostgreSQL owns persistent state and economic authority.

## What is playable

- Sign up, confirm email if enabled, log in, and log out.
- New accounts automatically receive 500 coins, 100 energy, a level-one resident, empty resources, a Starter Home, and Season 0 progress.
- Tap/click illustrated town destinations and watch the resident walk smoothly to them.
- Work as a Lumberjack in the Forest, Miner at the Mine, or Farmer at the Farm with exact server-owned rewards and energy costs.
- Open the Bag to inspect resources or consume a crafted Meal for up to 20 Energy.
- Craft Planks, Meals, and Tools through one trusted recipe action.
- Walk to Town Hall and complete **Repair the Old Bridge** once for 180 Coins, 40 XP, and 15 offchain Founder Points.
- Inspect Novice, Apprentice, Specialist, and Master profession ranks in the Resident Profile.
- Walk to the Market to buy or sell Wood, Stone, Iron, and Food against bounded dynamic prices.
- Earn 10 Merchant XP and daily trade-quest progress for each successful market action.
- Reserve construction materials at Home and permanently upgrade through House and Workshop Home tiers.
- See property storage enforced across jobs, crafting outputs, and market purchases.
- Reload or log out/in; economic progress and current location are loaded from PostgreSQL.

Businesses, resident assignment, wallets, and blockchain functionality remain intentionally out of scope.

## Local setup

Requirements: Node.js 20+, Docker Desktop, and the Supabase CLI (or a hosted Supabase project).

```bash
cp .env.example .env.local
npm install
npx supabase start
npx supabase functions serve game-action --env-file supabase/.env.local
npm run dev
```

Copy the local API URL and anon key printed by `supabase start` into `.env.local`. The Edge Function receives `SUPABASE_URL` and `SUPABASE_ANON_KEY` automatically when served locally. For a hosted project, run `supabase link`, `supabase db push`, and `supabase functions deploy game-action`, then use the hosted URL and anon key.

## Required environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser | Supabase project API URL |
| `VITE_SUPABASE_ANON_KEY` | Browser | Public anon key; RLS remains the security boundary |
| `SUPABASE_URL` | Edge Function | Injected by Supabase |
| `SUPABASE_ANON_KEY` | Edge Function | Injected by Supabase; forwards the caller JWT |

Never put the service-role key or any future wallet private key in a `VITE_` variable.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
```

The 39 unit tests cover all prior behavior plus scarcity bounds, deterministic prices, upward fee rounding, quantity validation, market balances/supply, Merchant XP, trade quests, concurrent/idempotent actions, property costs, and storage enforcement. The pgTAP integration suite exercises starter provisioning, RLS, jobs, crafting, market trades, construction reserves, property upgrades, ledgers, and idempotent replay against local Supabase.

## Architecture

- `src/game`: Phaser scenes, interactions, and the visual world.
- `src/components`: React account, HUD, navigation, and management panels.
- `src/stores`: Zustand orchestration and safe optimistic location updates.
- `src/services`: Supabase authentication/state/action boundary.
- `src/config`: centralized economy constants for presentation/shared logic.
- `src/domain`: framework-free economy rules and tests.
- `supabase/migrations`: schema, row-level security, starter-state trigger, immutable ledger, generalized jobs, recipes, Meal use, marketplace state, construction reserves, property upgrades, and storage enforcement.
- `supabase/functions`: authenticated action routing. The browser sends only action identifiers and idempotency keys, never economic values.

## Marketplace rules

The server calculates `multiplier = clamp(initialSupply / currentSupply, 0.70, 1.50)` and rounds `basePrice × multiplier` to the nearest whole Coin. Fees are `ceil(gross × 5%)`. Buyers pay `gross + fee`; sellers receive `gross - fee`. Fees accumulate in `market_fee_totals` and are not redistributed.

Every inventory unit uses one storage unit. Construction reserves solve the intentional Level 1 constraint—its 50-unit storage cannot simultaneously hold the 65 materials required for Level 2—without changing any costs or capacity values. Reserved materials are permanently committed, leave inventory storage, and count toward the exact final upgrade requirement.

Economic configuration used by live database actions is deliberately repeated in the migration because the database is authoritative. Future economic changes should ship as a reviewed migration and update `src/config/economy.ts` in the same commit.

## Business production

General Store, Restaurant, and Workshop ownership, resident assignment, production timers, outputs, tax, and XP are server-authoritative. Assignment alone does not block ordinary jobs; only `PRODUCING` does. Production consumes no Energy, cannot be cancelled, and continues offline because PostgreSQL persists `started_at` and `ready_at` using server time.

Future output capacity uses `production_output_reservations`, deliberately separate from construction-material reservations. Effective storage is inventory plus reserved production output. Claims remove the reservation before atomically creating Meals or Tools. General Store claims instead grant 71 Coins after the separately tracked 4-Coin tax sink.

## Milestone 5 retention and telemetry

Daily quests and three rotating Town Hall orders are generated deterministically for the current PostgreSQL UTC date and persisted without deleting history. Founder Points are granted through explicit daily, weekly-streak, and achievement claims, with recent earnings recorded in an immutable bounded history. Qualification tiers remain centralized and derived from authoritative FP.

Economy records now carry `economy_version = 1`. Ledger-derived daily metrics, marketplace pressure, storage/property/business distributions, activity counts, business taxes, rate-limit signals, and an admin-only read RPC provide the first balance-visibility layer. Admin authorization is enforced by `profiles.app_role`; it is not based on a hidden client route. Balance configuration remains source-controlled.

The General Store was not rebalanced. At initial market prices its inputs are worth 98 Coins while its net output is 71 Coins, an estimated loss of 27 Coins per cycle or 108 Coins/hour. Restaurant estimates +56 Coins/cycle and Workshop -24 Coins/cycle at the same reference prices. These are analytics estimates, not automatic recipe changes.
