-- Milestone 7 runtime corrections found by the disposable PostgreSQL CI run.
--
-- The first CI execution proved these function bodies need explicit
-- PL/pgSQL name-conflict handling, but Supabase local migrations run as a
-- non-superuser and cannot ALTER FUNCTION SET plpgsql.variable_conflict.
-- Keep this migration historical and non-fatal; the next additive migration
-- replaces the affected functions with body-local conflict directives.

do $$
begin
  begin
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
    alter function public.get_admin_economy_dashboard_v2(integer)
      set plpgsql.variable_conflict to 'use_column';
  exception
    when insufficient_privilege then
      raise notice 'Skipping function-level plpgsql.variable_conflict GUC; corrected in migration 202609170008.';
  end;
end $$;
