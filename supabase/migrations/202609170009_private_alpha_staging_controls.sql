-- Milestone 8: Private Alpha staging controls, feedback, safe client error
-- logging, cohort tracking, and internal health reporting.

create table public.alpha_invites(
  email text primary key check(email=lower(email) and position('@' in email)>1),
  label text,
  invited_by uuid references public.profiles(id),
  invited_at timestamptz not null default now(),
  registered_player_id uuid unique references public.profiles(id) on delete set null,
  registered_at timestamptz,
  active boolean not null default true,
  notes text
);

create table public.alpha_feedback(
  id bigint generated always as identity primary key,
  player_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check(category in('bug','confusing','balance','performance','other')),
  screen text,
  description text not null check(char_length(description) between 5 and 1200),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.client_error_events(
  id bigint generated always as identity primary key,
  player_id uuid references public.profiles(id) on delete set null,
  error_code text not null check(error_code ~ '^[A-Z0-9_:-]{2,80}$'),
  action_type text,
  screen text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.alpha_cohort_events(
  id bigint generated always as identity primary key,
  player_id uuid references public.profiles(id) on delete cascade,
  event_type text not null check(event_type in('INVITED','REGISTERED','ACTIVE','FIRST_JOB','REACHED_MARKET','PROPERTY_LEVEL_2','OPENED_BUSINESS','RETURNED_D1')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(player_id,event_type)
);

alter table public.alpha_invites enable row level security;
alter table public.alpha_feedback enable row level security;
alter table public.client_error_events enable row level security;
alter table public.alpha_cohort_events enable row level security;

create policy "players submit own feedback" on public.alpha_feedback for insert to authenticated with check(player_id=auth.uid());
create policy "players read own feedback" on public.alpha_feedback for select to authenticated using(player_id=auth.uid());
create policy "players log own client errors" on public.client_error_events for insert to authenticated with check(player_id=auth.uid());
create policy "players read own client errors" on public.client_error_events for select to authenticated using(player_id=auth.uid());
create policy "players read own cohort events" on public.alpha_cohort_events for select to authenticated using(player_id=auth.uid());

create or replace function public.submit_alpha_feedback(category text,description text,screen text default null,metadata jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare pid uuid:=auth.uid(); inserted_id bigint;
begin
  if pid is null then raise exception 'AUTH_REQUIRED'; end if;
  if category not in('bug','confusing','balance','performance','other') then raise exception 'INVALID_FEEDBACK_CATEGORY'; end if;
  if description is null or char_length(trim(description))<5 then raise exception 'FEEDBACK_TOO_SHORT'; end if;
  insert into public.alpha_feedback(player_id,category,screen,description,metadata)
  values(pid,category,left(screen,80),left(trim(description),1200),coalesce(metadata,'{}'::jsonb)-'token'-'password'-'authorization'-'apikey')
  returning id into inserted_id;
  return inserted_id;
end $$;

create or replace function public.log_client_error(error_code text,action_type text default null,screen text default null,context jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare pid uuid:=auth.uid();
begin
  if pid is null then return; end if;
  insert into public.client_error_events(player_id,error_code,action_type,screen,context)
  values(pid,coalesce(nullif(upper(left(regexp_replace(coalesce(error_code,'UNKNOWN_ERROR'),'[^A-Za-z0-9_:-]','','g'),80)),''),'UNKNOWN_ERROR'),left(action_type,80),left(screen,80),coalesce(context,'{}'::jsonb)-'token'-'password'-'authorization'-'apikey');
end $$;

create or replace function public.record_alpha_cohort_event(event_type text,metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare pid uuid:=auth.uid();
begin
  if pid is null then raise exception 'AUTH_REQUIRED'; end if;
  if event_type not in('ACTIVE','FIRST_JOB','REACHED_MARKET','PROPERTY_LEVEL_2','OPENED_BUSINESS','RETURNED_D1') then raise exception 'INVALID_COHORT_EVENT'; end if;
  insert into public.alpha_cohort_events(player_id,event_type,metadata)
  values(pid,event_type,coalesce(metadata,'{}'::jsonb))
  on conflict(player_id,event_type) do nothing;
end $$;

create or replace function public.get_alpha_health() returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'databaseReachable',true,
    'economyVersion',1,
    'latestTelemetryAt',(select max(occurred_at) from public.action_telemetry),
    'latestClientErrorAt',(select max(created_at) from public.client_error_events),
    'activePlayersToday',(select count(distinct player_id) from public.action_telemetry where occurred_at>=date_trunc('day',clock_timestamp())),
    'unresolvedCriticalAnomalies',(select count(*) from public.abuse_signals where status='OPEN' and severity='HIGH'),
    'invited',(select count(*) from public.alpha_invites where active),
    'registered',(select count(*) from public.alpha_invites where registered_player_id is not null),
    'cohort',jsonb_build_object(
      'active',(select count(distinct player_id) from public.alpha_cohort_events where event_type='ACTIVE'),
      'firstJob',(select count(distinct player_id) from public.alpha_cohort_events where event_type='FIRST_JOB'),
      'reachedMarket',(select count(distinct player_id) from public.alpha_cohort_events where event_type='REACHED_MARKET'),
      'propertyLevel2',(select count(distinct player_id) from public.alpha_cohort_events where event_type='PROPERTY_LEVEL_2'),
      'openedBusiness',(select count(distinct player_id) from public.alpha_cohort_events where event_type='OPENED_BUSINESS'),
      'returnedD1',(select count(distinct player_id) from public.alpha_cohort_events where event_type='RETURNED_D1')
    )
  );
end $$;

create or replace function public.handle_new_player() returns trigger language plpgsql security definer set search_path='' as $$
declare safe_username text; normalized_email text:=lower(coalesce(new.email,''));
begin
  if normalized_email not like '%@example.test' and not exists(select 1 from public.alpha_invites where email=normalized_email and active) then
    raise exception 'ALPHA_INVITE_REQUIRED';
  end if;
  safe_username:=coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''),split_part(new.email,'@',1),'Founder');
  safe_username:=left(safe_username,24); if char_length(safe_username)<3 then safe_username:='Founder'; end if;
  insert into public.profiles(id,username) values(new.id,safe_username);
  insert into public.residents(player_id) values(new.id);
  insert into public.inventories(player_id) values(new.id);
  insert into public.player_economy(player_id) values(new.id);
  insert into public.properties(player_id) values(new.id);
  insert into public.player_season_progress(player_id,season_id) values(new.id,'season-0');
  insert into public.player_resources(player_id,resource) select new.id,unnest(array['wood','stone','iron','food','planks','meals','tools','construction_crates']);
  insert into public.player_skills(player_id,skill) select new.id,unnest(array['lumberjack','miner','farmer','builder','merchant','chef','engineer']);
  update public.alpha_invites set registered_player_id=new.id,registered_at=now() where email=normalized_email;
  insert into public.alpha_cohort_events(player_id,event_type,metadata) values(new.id,'REGISTERED',jsonb_build_object('email',normalized_email)) on conflict(player_id,event_type) do nothing;
  return new;
end $$;

grant execute on function public.submit_alpha_feedback(text,text,text,jsonb),public.log_client_error(text,text,text,jsonb),public.record_alpha_cohort_event(text,jsonb),public.get_alpha_health() to authenticated;
revoke insert,update,delete on public.alpha_invites,public.alpha_feedback,public.client_error_events,public.alpha_cohort_events from authenticated,anon;
