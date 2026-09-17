# Supabase Backup and Restore Runbook

Never test this procedure against production without an approved maintenance window and verified destination.

Before every Alpha schema migration, record the deployed migration version, export the schema, and take a provider-managed database backup or `pg_dump` in custom format. Store data backups encrypted with restricted access; keep environment secrets outside the archive.

Suggested local rehearsal:

```bash
supabase db dump --local --schema public,auth --file backup/schema.sql
pg_dump "$DATABASE_URL" --format=custom --file=backup/data.dump
createdb restore_rehearsal
pg_restore --clean --if-exists --no-owner --dbname=restore_rehearsal backup/data.dump
```

Restore expectations:

1. Restore into an isolated database first.
2. Apply or verify the exact source-controlled migration version.
3. Confirm Auth/profile relationships, immutable ledgers, inventory totals, reservations, productions, FP history, and RLS.
4. Run all pgTAP and application tests.
5. Compare row counts and sampled player state before promotion.

Treat a schema-only migration backup as insufficient once Alpha player data exists.
