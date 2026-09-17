-- Milestone 7 runtime corrections found by the disposable PostgreSQL CI run.
--
-- These functions intentionally use local variables whose names also exist as
-- table or subquery columns. PostgreSQL's default ambiguity policy rejects the
-- affected statements when they are first planned at runtime. Pin the intended
-- resolution per function without rewriting the already-applied migrations.

alter function public.open_business(text, uuid)
  set plpgsql.variable_conflict to 'use_variable';
alter function public.assign_resident_to_business(uuid, uuid, uuid)
  set plpgsql.variable_conflict to 'use_variable';
alter function public.unassign_resident_from_business(uuid, uuid, uuid)
  set plpgsql.variable_conflict to 'use_variable';
alter function public.start_business_production(uuid, text, uuid)
  set plpgsql.variable_conflict to 'use_variable';
alter function public.claim_business_production(uuid, uuid)
  set plpgsql.variable_conflict to 'use_variable';

-- In the dashboard resource aggregate, created/destroyed must refer to the
-- aggregate columns when both column and PL/pgSQL variable names are visible.
alter function public.get_admin_economy_dashboard_v2(integer)
  set plpgsql.variable_conflict to 'use_column';
