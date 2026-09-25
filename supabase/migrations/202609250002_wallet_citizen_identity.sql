-- Wallet-first identity foundation. NFT ownership remains verified by the Edge
-- Function because PostgreSQL must not trust browser-provided eligibility.

create table public.wallet_identities(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  wallet_address text not null unique check(wallet_address ~ '^0x[0-9a-f]{40}$'),
  chain_id integer not null check(chain_id > 0),
  provider text not null default 'web3' check(provider='web3'),
  verified_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wallet_identities enable row level security;
create policy "players read own wallet identity" on public.wallet_identities for select to authenticated using(user_id=auth.uid());
revoke all on public.wallet_identities from public,anon,authenticated;
grant select on public.wallet_identities to authenticated;

create table public.citizen_access_grants(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  access_source text not null default 'nft' check(access_source in('nft','legacy_alpha')),
  wallet_address text check(wallet_address ~ '^0x[0-9a-f]{40}$'),
  chain_id integer check(chain_id=4663),
  contract_address text check(contract_address ~ '^0x[0-9a-f]{40}$'),
  nft_balance numeric not null check(nft_balance>=0),
  verified_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>verified_at)
  ,check((access_source='nft' and wallet_address is not null and chain_id=4663 and contract_address is not null and nft_balance>=1)
    or (access_source='legacy_alpha' and wallet_address is null and chain_id is null and contract_address is null and nft_balance=0))
);
alter table public.citizen_access_grants enable row level security;
create policy "players read own citizen grant" on public.citizen_access_grants for select to authenticated using(user_id=auth.uid());
revoke all on public.citizen_access_grants from public,anon,authenticated;
grant select on public.citizen_access_grants to authenticated;

create or replace function public.enforce_citizen_economy_access() returns trigger
language plpgsql security definer set search_path=''
as $$
declare row_player uuid;
begin
  -- Migration, Auth provisioning, and service-role maintenance have no player
  -- JWT. Requests carrying a player JWT must hold a fresh server-issued grant.
  if auth.uid() is null or auth.role()='service_role' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if current_setting('app.allow_legacy_alpha_testers',true)='on' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  row_player:=coalesce((to_jsonb(new)->>'player_id')::uuid,(to_jsonb(old)->>'player_id')::uuid);
  if row_player is distinct from auth.uid() then raise exception 'PLAYER_IDENTITY_MISMATCH'; end if;
  if not exists(select 1 from public.citizen_access_grants g where g.user_id=auth.uid() and g.expires_at>clock_timestamp()) then
    raise exception 'CITIZEN_NFT_REQUIRED';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.enforce_citizen_economy_access() from public,anon,authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['residents','player_resources','player_skills','player_economy','properties','player_businesses','player_quests','player_season_progress','market_transactions','economy_transactions','action_requests','property_upgrade_progress','business_productions','production_output_reservations','player_orders','player_daily_orders','achievement_claims','founder_point_history','business_events','action_telemetry'] loop
    if to_regclass('public.'||table_name) is not null then
      execute format('create trigger citizen_economy_gate before insert or update or delete on public.%I for each row execute function public.enforce_citizen_economy_access()',table_name);
    end if;
  end loop;
end $$;

create or replace function public.handle_new_player() returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  safe_username text;
  normalized_email text:=lower(coalesce(new.email,''));
  test_account boolean:=normalized_email like '%@example.test';
  web3_account boolean:=coalesce(new.raw_app_meta_data->>'provider','')='web3'
    and coalesce(new.raw_user_meta_data->>'chain','')='ethereum';
  wallet_address text:=lower(coalesce(new.raw_user_meta_data->>'address',''));
begin
  if not web3_account and not test_account then
    perform 1 from public.alpha_invites
    where email=normalized_email and active and registered_player_id is null for update;
    if not found then raise exception 'ALPHA_INVITE_REQUIRED'; end if;
  end if;

  if web3_account and wallet_address !~ '^0x[0-9a-f]{40}$' then
    raise exception 'INVALID_WEB3_IDENTITY';
  end if;

  safe_username:=coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''),
    case when web3_account then 'Citizen-'||right(wallet_address,6) else split_part(new.email,'@',1) end,'Founder');
  safe_username:=left(safe_username,24);
  if char_length(safe_username)<3 then safe_username:='Founder'; end if;

  insert into public.profiles(id,username) values(new.id,safe_username);
  insert into public.residents(player_id) values(new.id);
  insert into public.inventories(player_id) values(new.id);
  insert into public.player_economy(player_id) values(new.id);
  insert into public.properties(player_id) values(new.id);
  insert into public.player_season_progress(player_id,season_id) values(new.id,'season-0');
  insert into public.player_resources(player_id,resource) select new.id,unnest(array['wood','stone','iron','food','planks','meals','tools','construction_crates']);
  insert into public.player_skills(player_id,skill) select new.id,unnest(array['lumberjack','miner','farmer','builder','merchant','chef','engineer']);

  if web3_account then
    insert into public.wallet_identities(user_id,wallet_address,chain_id)
    values(new.id,wallet_address,(new.raw_user_meta_data->>'network')::integer);
  elsif not test_account then
    update public.alpha_invites set registered_player_id=new.id,registered_at=now(),active=false
    where email=normalized_email and active and registered_player_id is null;
    if not found then raise exception 'ALPHA_INVITE_REQUIRED'; end if;
  end if;

  insert into public.alpha_cohort_events(player_id,event_type,metadata)
  values(new.id,'REGISTERED',case when web3_account then jsonb_build_object('authMethod','web3') else jsonb_build_object('email',normalized_email) end)
  on conflict(player_id,event_type) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_player() from public,anon,authenticated;
