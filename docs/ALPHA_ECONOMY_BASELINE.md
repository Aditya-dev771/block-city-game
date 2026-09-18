# Private Alpha Economy Baseline

Baseline date: 2026-09-17

This document records the starting Private Alpha configuration. Do not rebalance these values before the first small tester cohort unless staging uncovers a critical exploit.

## Version

- Economy version: `1`
- Season: `season-0`
- Daily Founder Point cap: `45`
- Marketplace fee: `5%`, rounded up

## Starter State

- Coins: `500`
- Energy: `100`
- Property: Level 1 Starter Home
- Resident level: `1`
- Founder Points: `0`
- Storage capacity: `50`
- Resident capacity: `1`
- Business slots: `0`

## Jobs

| Job | Energy | Rewards |
| --- | ---: | --- |
| Lumberjack | 10 | 8 Wood, 14 Coins, 12 XP, 12 Lumberjack XP |
| Miner | 12 | 7 Stone, 2 Iron, 12 Coins, 18 XP, 12 Miner XP |
| Farmer | 8 | 6 Food, 10 Coins, 10 XP, 12 Farmer XP |

## Crafting

| Recipe | Cost | Output |
| --- | --- | --- |
| Planks | 5 Wood, 5 Coins | 2 Planks |
| Meal | 3 Food, 5 Coins | 1 Meal |
| Tool | 3 Iron, 2 Wood, 15 Coins | 1 Tool |

## Marketplace

| Resource | Base Price | Initial Supply |
| --- | ---: | ---: |
| Wood | 22 | 120 |
| Stone | 18 | 140 |
| Iron | 48 | 60 |
| Food | 16 | 180 |

Pricing multiplier is `initialSupply / currentSupply`, clamped from `0.70` to `1.50`.

## Property

| Level | Name | Cost | Storage | Residents | Business Slots |
| --- | --- | --- | ---: | ---: | ---: |
| 1 | Starter Home | None | 50 | 1 | 0 |
| 2 | House | 500 Coins, 40 Wood, 25 Stone | 100 | 3 | 1 |
| 3 | Workshop Home | 1200 Coins, 30 Wood, 25 Stone, 8 Iron | 180 | 5 | 2 |

## Businesses

| Business | Open Cost | Input | Output | Duration | Output Storage |
| --- | ---: | --- | --- | ---: | ---: |
| General Store | 600 Coins | 3 Wood, 2 Food | 75 gross Coins, 5% tax | 15 min | 0 |
| Restaurant | 700 Coins | 4 Food | 2 Meals | 20 min | 2 |
| Workshop | 900 Coins | 4 Wood, 2 Iron | 1 Tool | 30 min | 1 |

## Founder Point Thresholds

| Rank | Minimum FP |
| --- | ---: |
| Citizen | 500 |
| Whitelist | 1200 |
| Priority | 2000 |
| Guaranteed | 3000 |

## Alpha Data Policy

Private Alpha progress is disposable but useful for testing. Economy values, Founder Points, cohorts, and eligibility language may change. Alpha progress does not imply monetary value, token value, or NFT entitlement.
