create extension if not exists pgcrypto;

create type public.game_location as enum ('town-square','forest','mine','farm','town-hall','home','market','workshop','industrial');
create type public.resource_kind as enum ('coins','wood','stone','iron','food','planks','meals','tools','construction_crates','energy','xp','lumberjack_xp','miner_xp','farmer_xp','founder_points');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 3 and 24),
  created_at timestamptz not null default now()
);
create table public.residents (
  id uuid primary key default gen_random_uuid(), player_id uuid unique not null references public.profiles(id) on delete cascade,
  level int not null default 1 check (level >= 1), xp int not null default 0 check (xp >= 0),
  energy int not null default 100 check (energy between 0 and 100), max_energy int not null default 100 check (max_energy > 0),
  current_location public.game_location not null default 'town-square', jobs_completed int not null default 0 check (jobs_completed >= 0),
  orders_completed int not null default 0 check (orders_completed >= 0), trades_completed int not null default 0 check (trades_completed >= 0)
);
create table public.inventories (player_id uuid primary key references public.profiles(id) on delete cascade, updated_at timestamptz not null default now());
create table public.player_resources (
  player_id uuid not null references public.profiles(id) on delete cascade,
  resource text not null check (resource in ('wood','stone','iron','food','planks','meals','tools','construction_crates')),
  amount int not null default 0 check (amount >= 0), primary key (player_id, resource)
);
create table public.player_skills (
  player_id uuid not null references public.profiles(id) on delete cascade,
  skill text not null check (skill in ('lumberjack','miner','farmer','builder','merchant','chef','engineer')),
  xp int not null default 0 check (xp >= 0), primary key (player_id, skill)
);
create table public.player_economy (player_id uuid primary key references public.profiles(id) on delete cascade, coins bigint not null default 500 check (coins >= 0));
create table public.properties (
  player_id uuid primary key references public.profiles(id) on delete cascade, level int not null default 1 check (level between 1 and 3),
  storage_capacity int not null default 50, resident_capacity int not null default 1, business_slots int not null default 0
);
create table public.businesses (id text primary key, name text not null, enabled boolean not null default true);
create table public.player_businesses (id uuid primary key default gen_random_uuid(), player_id uuid not null references public.profiles(id) on delete cascade, business_id text not null references public.businesses(id), status text not null default 'open', created_at timestamptz not null default now());
create table public.quests (id text primary key, title text not null, target int not null check (target > 0), founder_points int not null check (founder_points >= 0), active boolean not null default true);
create table public.player_quests (player_id uuid not null references public.profiles(id) on delete cascade, quest_id text not null references public.quests(id), progress int not null default 0, claimed_at timestamptz, quest_date date not null default current_date, primary key (player_id, quest_id, quest_date));
create table public.seasons (id text primary key, name text not null, starts_at timestamptz, ends_at timestamptz, active boolean not null default false);
create table public.player_season_progress (player_id uuid not null references public.profiles(id) on delete cascade, season_id text not null references public.seasons(id), founder_points int not null default 0 check (founder_points >= 0), streak int not null default 0, achievements jsonb not null default '[]', founder_seals int not null default 0, rank text not null default 'Settler', daily_fp_earned int not null default 0, fp_day date not null default current_date, primary key (player_id, season_id));
create table public.market_transactions (id uuid primary key default gen_random_uuid(), player_id uuid not null references public.profiles(id), side text not null check (side in ('buy','sell')), resource text not null, quantity int not null check (quantity > 0), unit_price int not null check (unit_price > 0), fee bigint not null check (fee >= 0), created_at timestamptz not null default now());
create table public.economy_transactions (
  id uuid primary key default gen_random_uuid(), player_id uuid not null references public.profiles(id), transaction_type text not null,
  resource public.resource_kind not null, amount bigint not null, balance_before bigint not null check (balance_before >= 0), balance_after bigint not null check (balance_after >= 0),
  created_at timestamptz not null default now(), reference_id uuid not null,
  unique (player_id, transaction_type, resource, reference_id)
);
create table public.action_requests (player_id uuid not null references public.profiles(id), idempotency_key uuid not null, action text not null, result jsonb, created_at timestamptz not null default now(), primary key(player_id, idempotency_key));

create or replace function public.reject_ledger_mutation() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Economy ledger rows are immutable'; end $$;
create trigger economy_ledger_immutable before update or delete on public.economy_transactions for each row execute procedure public.reject_ledger_mutation();

insert into public.businesses values ('general_store','General Store',true),('restaurant','Restaurant',true);
insert into public.seasons values ('season-0','Founding Era',now(),null,true);
insert into public.quests values ('daily-jobs-3','Complete 3 Jobs',3,10,true),('daily-order-1','Complete 1 NPC Order',1,15,true),('daily-trades-2','Make 2 Marketplace Trades',2,10,true);

create or replace function public.handle_new_player() returns trigger language plpgsql security definer set search_path = '' as $$
declare safe_username text;
begin
  safe_username := coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1), 'Founder');
  safe_username := left(safe_username, 24); if char_length(safe_username) < 3 then safe_username := 'Founder'; end if;
  insert into public.profiles(id, username) values (new.id, safe_username);
  insert into public.residents(player_id) values (new.id);
  insert into public.inventories(player_id) values (new.id);
  insert into public.player_economy(player_id) values (new.id);
  insert into public.properties(player_id) values (new.id);
  insert into public.player_season_progress(player_id, season_id) values (new.id, 'season-0');
  insert into public.player_resources(player_id, resource) select new.id, unnest(array['wood','stone','iron','food','planks','meals','tools','construction_crates']);
  insert into public.player_skills(player_id, skill) select new.id, unnest(array['lumberjack','miner','farmer','builder','merchant','chef','engineer']);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_player();

create or replace function public.get_player_game_state(target_player uuid default auth.uid()) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'playerId', p.id, 'account', jsonb_build_object('username',p.username,'createdAt',p.created_at),
    'resident', jsonb_build_object('id',r.id,'level',r.level,'xp',r.xp,'energy',r.energy,'maxEnergy',r.max_energy,'currentLocation',r.current_location,'jobsCompleted',r.jobs_completed,'ordersCompleted',r.orders_completed,'tradesCompleted',r.trades_completed),
    'skills', (select jsonb_object_agg(skill,xp) from public.player_skills where player_id=p.id),
    'economy', jsonb_build_object('coins',e.coins),
    'inventory', (select jsonb_object_agg(case when resource='construction_crates' then 'constructionCrates' else resource end,amount) from public.player_resources where player_id=p.id),
    'property', jsonb_build_object('level',pr.level,'storageCapacity',pr.storage_capacity,'residentCapacity',pr.resident_capacity,'businessSlots',pr.business_slots),
    'businesses', coalesce((select jsonb_agg(jsonb_build_object('id',pb.id,'type',pb.business_id,'status',pb.status)) from public.player_businesses pb where pb.player_id=p.id),'[]'::jsonb),
    'season', jsonb_build_object('seasonId',sp.season_id,'founderPoints',sp.founder_points,'streak',sp.streak,'achievements',sp.achievements,'founderSeals',sp.founder_seals,'rank',sp.rank)
  ) from public.profiles p join public.residents r on r.player_id=p.id join public.player_economy e on e.player_id=p.id join public.properties pr on pr.player_id=p.id join public.player_season_progress sp on sp.player_id=p.id and sp.season_id='season-0'
  where p.id=target_player and target_player=auth.uid();
$$;

create or replace function public.set_current_location(next_location text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if next_location not in ('town-square','forest','mine','farm','town-hall','home','market','workshop') then raise exception 'Invalid or locked location'; end if;
  update public.residents set current_location=next_location::public.game_location where player_id=auth.uid();
  if not found then raise exception 'Resident not found'; end if;
end $$;

create or replace function public.perform_lumberjack_job(request_key uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare pid uuid := auth.uid(); rid uuid; energy_before int; wood_before int; coins_before bigint; request_result jsonb; ref uuid := gen_random_uuid();
begin
  if pid is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(pid::text || request_key::text, 0));
  select result into request_result from public.action_requests where player_id=pid and idempotency_key=request_key;
  if found and request_result is not null then return request_result; end if;
  insert into public.action_requests(player_id,idempotency_key,action) values(pid,request_key,'work_lumberjack');
  select id,energy into rid,energy_before from public.residents where player_id=pid for update;
  if energy_before < 10 then raise exception 'Not enough energy'; end if;
  if (select current_location from public.residents where id=rid) <> 'forest' then raise exception 'Resident must be at the forest'; end if;
  select amount into wood_before from public.player_resources where player_id=pid and resource='wood' for update;
  select coins into coins_before from public.player_economy where player_id=pid for update;
  update public.residents set energy=energy-10,xp=xp+12,jobs_completed=jobs_completed+1 where id=rid;
  update public.player_resources set amount=amount+8 where player_id=pid and resource='wood';
  update public.player_economy set coins=coins+14 where player_id=pid;
  update public.player_skills set xp=xp+12 where player_id=pid and skill='lumberjack';
  insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values
    (pid,'job_reward','energy',-10,energy_before,energy_before-10,ref),(pid,'job_reward','wood',8,wood_before,wood_before+8,ref),(pid,'job_reward','coins',14,coins_before,coins_before+14,ref);
  request_result := jsonb_build_object('state',public.get_player_game_state(pid),'message','Shift complete: +8 wood, +14 coins','transactionId',ref);
  update public.action_requests set result=request_result where player_id=pid and idempotency_key=request_key;
  return request_result;
end $$;

alter table public.profiles enable row level security; alter table public.residents enable row level security; alter table public.inventories enable row level security; alter table public.player_resources enable row level security; alter table public.player_skills enable row level security; alter table public.player_economy enable row level security; alter table public.properties enable row level security; alter table public.player_businesses enable row level security; alter table public.player_quests enable row level security; alter table public.player_season_progress enable row level security; alter table public.market_transactions enable row level security; alter table public.economy_transactions enable row level security; alter table public.action_requests enable row level security;
create policy "read own profile" on public.profiles for select using (id=auth.uid());
create policy "read own resident" on public.residents for select using (player_id=auth.uid());
create policy "read own inventory" on public.inventories for select using (player_id=auth.uid());
create policy "read own resources" on public.player_resources for select using (player_id=auth.uid());
create policy "read own skills" on public.player_skills for select using (player_id=auth.uid());
create policy "read own economy" on public.player_economy for select using (player_id=auth.uid());
create policy "read own property" on public.properties for select using (player_id=auth.uid());
create policy "read own businesses" on public.player_businesses for select using (player_id=auth.uid());
create policy "read own quests" on public.player_quests for select using (player_id=auth.uid());
create policy "read own season" on public.player_season_progress for select using (player_id=auth.uid());
create policy "read own market history" on public.market_transactions for select using (player_id=auth.uid());
create policy "read own ledger" on public.economy_transactions for select using (player_id=auth.uid());
grant execute on function public.get_player_game_state(uuid) to authenticated;
grant execute on function public.set_current_location(text) to authenticated;
grant execute on function public.perform_lumberjack_job(uuid) to authenticated;
revoke insert,update,delete on public.player_economy,public.player_resources,public.player_skills,public.economy_transactions from authenticated,anon;
