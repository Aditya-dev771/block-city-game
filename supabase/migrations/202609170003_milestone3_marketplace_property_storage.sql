-- Milestone 3: simulated marketplace, permanent property upgrades, and global storage enforcement.

create table public.market_resources (
  resource_id text primary key check (resource_id in ('wood','stone','iron','food')),
  base_price int not null check (base_price > 0),
  current_supply int not null check (current_supply >= 0),
  initial_supply int not null check (initial_supply > 0),
  min_multiplier numeric(4,2) not null default 0.70,
  max_multiplier numeric(4,2) not null default 1.50,
  updated_at timestamptz not null default now(),
  check (min_multiplier > 0 and max_multiplier >= min_multiplier)
);

insert into public.market_resources(resource_id,base_price,current_supply,initial_supply) values
  ('wood',22,120,120),('stone',18,140,140),('iron',48,60,60),('food',16,180,180);

create table public.market_fee_totals (
  id boolean primary key default true check (id),
  coins_removed bigint not null default 0 check (coins_removed >= 0),
  updated_at timestamptz not null default now()
);
insert into public.market_fee_totals(id) values(true);

create table public.property_upgrade_progress (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  target_level int not null check(target_level in (2,3)),
  wood int not null default 0 check(wood>=0),
  stone int not null default 0 check(stone>=0),
  iron int not null default 0 check(iron>=0),
  updated_at timestamptz not null default now()
);

alter table public.market_transactions add column if not exists gross bigint not null default 0;
alter table public.market_transactions add column if not exists net bigint not null default 0;
alter table public.market_transactions add column if not exists market_supply_before int not null default 0;
alter table public.market_transactions add column if not exists market_supply_after int not null default 0;
alter table public.market_transactions add column if not exists reference_id uuid;
update public.market_transactions set reference_id=id where reference_id is null;
alter table public.market_transactions alter column reference_id set not null;
create unique index if not exists market_transactions_reference_id_key on public.market_transactions(reference_id);

alter table public.market_resources enable row level security;
alter table public.market_fee_totals enable row level security;
alter table public.property_upgrade_progress enable row level security;
create policy "authenticated users read market resources" on public.market_resources for select to authenticated using (true);
create policy "authenticated users read fee sink" on public.market_fee_totals for select to authenticated using (true);
create policy "read own property upgrade progress" on public.property_upgrade_progress for select using(player_id=auth.uid());
revoke insert,update,delete on public.market_resources,public.market_fee_totals,public.market_transactions,public.property_upgrade_progress from authenticated,anon;

create or replace function public.calculate_market_unit_price(base_price int,current_supply int,initial_supply int,min_multiplier numeric,max_multiplier numeric) returns int
language sql immutable set search_path='' as $$
  select round(base_price * least(max_multiplier,greatest(min_multiplier,case when current_supply=0 then max_multiplier else initial_supply::numeric/current_supply end)))::int;
$$;

create or replace function public.inventory_storage_used(target_player uuid) returns int
language sql stable security definer set search_path='' as $$
  select coalesce(sum(amount),0)::int from public.player_resources where player_id=target_player;
$$;

create or replace function public.enforce_inventory_storage() returns trigger
language plpgsql security definer set search_path='' as $$
declare capacity int; used int;
begin
  if new.amount <= old.amount then return new; end if;
  select storage_capacity into capacity from public.properties where player_id=new.player_id;
  select public.inventory_storage_used(new.player_id) into used;
  if capacity is null then raise exception 'Property storage not found'; end if;
  if used-old.amount+new.amount > capacity then raise exception 'Storage capacity exceeded (% / %)',used-old.amount+new.amount,capacity; end if;
  return new;
end $$;
create trigger enforce_player_inventory_storage before update of amount on public.player_resources for each row execute procedure public.enforce_inventory_storage();

create or replace function public.get_player_game_state(target_player uuid default auth.uid()) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'playerId', p.id, 'account', jsonb_build_object('username',p.username,'createdAt',p.created_at),
    'resident', jsonb_build_object('id',r.id,'level',r.level,'xp',r.xp,'energy',r.energy,'maxEnergy',r.max_energy,'currentLocation',r.current_location,'jobsCompleted',r.jobs_completed,'ordersCompleted',r.orders_completed,'tradesCompleted',r.trades_completed),
    'skills', (select jsonb_object_agg(skill,xp) from public.player_skills where player_id=p.id),
    'economy', jsonb_build_object('coins',e.coins),
    'inventory', (select jsonb_object_agg(case when resource='construction_crates' then 'constructionCrates' else resource end,amount) from public.player_resources where player_id=p.id),
    'property', jsonb_build_object('level',pr.level,'storageCapacity',pr.storage_capacity,'storageUsed',public.inventory_storage_used(p.id),'residentCapacity',pr.resident_capacity,'businessSlots',pr.business_slots,'upgradeProgress',coalesce((select jsonb_build_object('targetLevel',pup.target_level,'wood',pup.wood,'stone',pup.stone,'iron',pup.iron) from public.property_upgrade_progress pup where pup.player_id=p.id),jsonb_build_object('targetLevel',null,'wood',0,'stone',0,'iron',0))),
    'businesses', coalesce((select jsonb_agg(jsonb_build_object('id',pb.id,'type',pb.business_id,'status',pb.status)) from public.player_businesses pb where pb.player_id=p.id),'[]'::jsonb),
    'season', jsonb_build_object('seasonId',sp.season_id,'founderPoints',sp.founder_points,'streak',sp.streak,'achievements',sp.achievements,'founderSeals',sp.founder_seals,'rank',sp.rank),
    'orders', jsonb_build_object('repairOldBridge', exists(select 1 from public.player_orders po where po.player_id=p.id and po.order_id='repair_old_bridge')),
    'market', jsonb_build_object(
      'resources',coalesce((select jsonb_agg(jsonb_build_object('resourceId',mr.resource_id,'basePrice',mr.base_price,'currentPrice',public.calculate_market_unit_price(mr.base_price,mr.current_supply,mr.initial_supply,mr.min_multiplier,mr.max_multiplier),'currentSupply',mr.current_supply,'initialSupply',mr.initial_supply,'minMultiplier',mr.min_multiplier,'maxMultiplier',mr.max_multiplier) order by mr.resource_id) from public.market_resources mr),'[]'::jsonb),
      'recentTransactions',coalesce((select jsonb_agg(row_data) from (select jsonb_build_object('id',mt.id,'side',mt.side,'resource',mt.resource,'quantity',mt.quantity,'unitPrice',mt.unit_price,'gross',mt.gross,'fee',mt.fee,'net',mt.net,'createdAt',mt.created_at) row_data from public.market_transactions mt where mt.player_id=p.id order by mt.created_at desc limit 10) recent),'[]'::jsonb)
    )
  ) from public.profiles p join public.residents r on r.player_id=p.id join public.player_economy e on e.player_id=p.id join public.properties pr on pr.player_id=p.id join public.player_season_progress sp on sp.player_id=p.id and sp.season_id='season-0'
  where p.id=target_player and target_player=auth.uid();
$$;

create or replace function public.market_trade(trade_side text,requested_resource text,requested_quantity int,request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  pid uuid:=auth.uid(); resident_id uuid; request_result jsonb; existing_action text; ref uuid:=gen_random_uuid(); action_name text:=trade_side||':'||requested_resource||':'||requested_quantity;
  market_row public.market_resources%rowtype; coins_before bigint; resource_before int; merchant_before int; fee_sink_before bigint;
  unit_price int; gross_amount bigint; fee_amount bigint; net_amount bigint; supply_after int;
begin
  if pid is null then raise exception 'Authentication required'; end if;
  if trade_side not in ('market_buy','market_sell') then raise exception 'Unsupported market side'; end if;
  if requested_resource not in ('wood','stone','iron','food') then raise exception 'Unsupported market resource'; end if;
  if requested_quantity is null or requested_quantity<1 or requested_quantity>25 then raise exception 'Quantity must be between 1 and 25'; end if;
  perform pg_advisory_xact_lock(hashtextextended(pid::text||request_key::text,0));
  select action,result into existing_action,request_result from public.action_requests where player_id=pid and idempotency_key=request_key;
  if found then if existing_action<>action_name then raise exception 'Idempotency key already used for another action'; end if; if request_result is not null then return request_result; end if; end if;
  insert into public.action_requests(player_id,idempotency_key,action) values(pid,request_key,action_name);
  select id into resident_id from public.residents where player_id=pid and current_location='market' for update;
  if resident_id is null then raise exception 'Resident must be at the Market'; end if;
  select * into market_row from public.market_resources where resource_id=requested_resource for update;
  select coins into coins_before from public.player_economy where player_id=pid for update;
  select amount into resource_before from public.player_resources where player_id=pid and resource=requested_resource for update;
  select xp into merchant_before from public.player_skills where player_id=pid and skill='merchant' for update;
  select coins_removed into fee_sink_before from public.market_fee_totals where id=true for update;
  unit_price:=public.calculate_market_unit_price(market_row.base_price,market_row.current_supply,market_row.initial_supply,market_row.min_multiplier,market_row.max_multiplier);
  gross_amount:=unit_price*requested_quantity; fee_amount:=ceil(gross_amount*0.05)::bigint;
  if trade_side='market_buy' then
    net_amount:=gross_amount+fee_amount;
    if market_row.current_supply<requested_quantity then raise exception 'Unavailable market supply'; end if;
    if coins_before<net_amount then raise exception 'Not enough coins'; end if;
    supply_after:=market_row.current_supply-requested_quantity;
    update public.player_economy set coins=coins-net_amount where player_id=pid;
    update public.player_resources set amount=amount+requested_quantity where player_id=pid and resource=requested_resource;
    insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values
      (pid,'MARKET_BUY_COIN_COST','coins',-gross_amount,coins_before,coins_before-gross_amount,ref),
      (pid,'MARKET_FEE','coins',-fee_amount,coins_before-gross_amount,coins_before-net_amount,ref),
      (pid,'MARKET_BUY_RESOURCE',requested_resource::public.resource_kind,requested_quantity,resource_before,resource_before+requested_quantity,ref);
  else
    if resource_before<requested_quantity then raise exception 'Not enough %',requested_resource; end if;
    net_amount:=gross_amount-fee_amount; supply_after:=market_row.current_supply+requested_quantity;
    update public.player_resources set amount=amount-requested_quantity where player_id=pid and resource=requested_resource;
    update public.player_economy set coins=coins+net_amount where player_id=pid;
    insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values
      (pid,'MARKET_SELL_RESOURCE',requested_resource::public.resource_kind,-requested_quantity,resource_before,resource_before-requested_quantity,ref),
      (pid,'MARKET_SELL_COIN_REWARD','coins',gross_amount,coins_before,coins_before+gross_amount,ref),
      (pid,'MARKET_FEE','coins',-fee_amount,coins_before+gross_amount,coins_before+net_amount,ref);
  end if;
  update public.market_resources set current_supply=supply_after,updated_at=now() where resource_id=requested_resource;
  update public.market_fee_totals set coins_removed=coins_removed+fee_amount,updated_at=now() where id=true;
  update public.player_skills set xp=xp+10 where player_id=pid and skill='merchant';
  update public.residents set trades_completed=trades_completed+1 where player_id=pid;
  insert into public.player_quests(player_id,quest_id,progress,quest_date) values(pid,'daily-trades-2',1,current_date)
    on conflict(player_id,quest_id,quest_date) do update set progress=least(2,public.player_quests.progress+1);
  insert into public.market_transactions(player_id,side,resource,quantity,unit_price,gross,fee,net,market_supply_before,market_supply_after,reference_id)
    values(pid,case when trade_side='market_buy' then 'buy' else 'sell' end,requested_resource,requested_quantity,unit_price,gross_amount,fee_amount,net_amount,market_row.current_supply,supply_after,ref);
  request_result:=jsonb_build_object('state',public.get_player_game_state(pid),'message','Market transaction complete','transactionId',ref,'execution',jsonb_build_object('side',case when trade_side='market_buy' then 'buy' else 'sell' end,'resource',requested_resource,'quantity',requested_quantity,'unitPrice',unit_price,'gross',gross_amount,'fee',fee_amount,'net',net_amount));
  update public.action_requests set result=request_result where player_id=pid and idempotency_key=request_key;
  return request_result;
end $$;

create or replace function public.fund_property_upgrade(target_level int,request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid:=auth.uid(); resident_id uuid; request_result jsonb; existing_action text; ref uuid:=gen_random_uuid(); action_name text:='fund_property_upgrade:'||target_level;
  current_level int; progress public.property_upgrade_progress%rowtype; wood_before int; stone_before int; iron_before int;
  wood_cost int; stone_cost int; iron_cost int:=0; wood_take int; stone_take int; iron_take int;
begin
  if pid is null then raise exception 'Authentication required'; end if;
  if target_level not in (2,3) then raise exception 'Unsupported property level'; end if;
  perform pg_advisory_xact_lock(hashtextextended(pid::text||request_key::text,0));
  select action,result into existing_action,request_result from public.action_requests where player_id=pid and idempotency_key=request_key;
  if found then if existing_action<>action_name then raise exception 'Idempotency key already used for another action'; end if; if request_result is not null then return request_result; end if; end if;
  insert into public.action_requests(player_id,idempotency_key,action) values(pid,request_key,action_name);
  select id into resident_id from public.residents where player_id=pid and current_location='home' for update;
  if resident_id is null then raise exception 'Resident must be at Home'; end if;
  select level into current_level from public.properties where player_id=pid for update;
  if target_level<>current_level+1 then raise exception 'Property upgrades must advance exactly one level'; end if;
  if target_level=2 then wood_cost:=40; stone_cost:=25; else wood_cost:=30; stone_cost:=25; iron_cost:=8; end if;
  insert into public.property_upgrade_progress(player_id,target_level) values(pid,target_level) on conflict(player_id) do nothing;
  select * into progress from public.property_upgrade_progress where player_id=pid for update;
  if progress.target_level<>target_level then raise exception 'Another property upgrade is already in progress'; end if;
  select amount into wood_before from public.player_resources where player_id=pid and resource='wood' for update;
  select amount into stone_before from public.player_resources where player_id=pid and resource='stone' for update;
  select amount into iron_before from public.player_resources where player_id=pid and resource='iron' for update;
  wood_take:=least(wood_before,wood_cost-progress.wood); stone_take:=least(stone_before,stone_cost-progress.stone); iron_take:=least(iron_before,iron_cost-progress.iron);
  if wood_take+stone_take+iron_take=0 then raise exception 'No required materials available to reserve'; end if;
  if wood_take>0 then update public.player_resources set amount=amount-wood_take where player_id=pid and resource='wood'; insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values(pid,'PROPERTY_UPGRADE_RESOURCE_COST','wood',-wood_take,wood_before,wood_before-wood_take,ref); end if;
  if stone_take>0 then update public.player_resources set amount=amount-stone_take where player_id=pid and resource='stone'; insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values(pid,'PROPERTY_UPGRADE_RESOURCE_COST','stone',-stone_take,stone_before,stone_before-stone_take,ref); end if;
  if iron_take>0 then update public.player_resources set amount=amount-iron_take where player_id=pid and resource='iron'; insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values(pid,'PROPERTY_UPGRADE_RESOURCE_COST','iron',-iron_take,iron_before,iron_before-iron_take,ref); end if;
  update public.property_upgrade_progress set wood=wood+wood_take,stone=stone+stone_take,iron=iron+iron_take,updated_at=now() where player_id=pid;
  request_result:=jsonb_build_object('state',public.get_player_game_state(pid),'message','Upgrade materials reserved','transactionId',ref);
  update public.action_requests set result=request_result where player_id=pid and idempotency_key=request_key;
  return request_result;
end $$;

create or replace function public.upgrade_property(target_level int,request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid:=auth.uid(); resident_id uuid; request_result jsonb; existing_action text; ref uuid:=gen_random_uuid(); action_name text:='upgrade_property:'||target_level;
  current_property public.properties%rowtype; coins_before bigint; wood_before int; stone_before int; iron_before int;
  progress public.property_upgrade_progress%rowtype; coin_cost int; wood_cost int; stone_cost int; iron_cost int:=0; wood_due int; stone_due int; iron_due int; next_storage int; next_residents int; next_slots int;
begin
  if pid is null then raise exception 'Authentication required'; end if;
  if target_level not in (2,3) then raise exception 'Unsupported property level'; end if;
  perform pg_advisory_xact_lock(hashtextextended(pid::text||request_key::text,0));
  select action,result into existing_action,request_result from public.action_requests where player_id=pid and idempotency_key=request_key;
  if found then if existing_action<>action_name then raise exception 'Idempotency key already used for another action'; end if; if request_result is not null then return request_result; end if; end if;
  insert into public.action_requests(player_id,idempotency_key,action) values(pid,request_key,action_name);
  select id into resident_id from public.residents where player_id=pid and current_location='home' for update;
  if resident_id is null then raise exception 'Resident must be at Home'; end if;
  select * into current_property from public.properties where player_id=pid for update;
  if target_level<>current_property.level+1 then raise exception 'Property upgrades must advance exactly one level'; end if;
  if target_level=2 then coin_cost:=500; wood_cost:=40; stone_cost:=25; next_storage:=100; next_residents:=3; next_slots:=1;
  else coin_cost:=1200; wood_cost:=30; stone_cost:=25; iron_cost:=8; next_storage:=180; next_residents:=5; next_slots:=2; end if;
  select coins into coins_before from public.player_economy where player_id=pid for update;
  select amount into wood_before from public.player_resources where player_id=pid and resource='wood' for update;
  select amount into stone_before from public.player_resources where player_id=pid and resource='stone' for update;
  select amount into iron_before from public.player_resources where player_id=pid and resource='iron' for update;
  select * into progress from public.property_upgrade_progress where player_id=pid for update;
  if progress.target_level is not null and progress.target_level<>target_level then raise exception 'Another property upgrade is already in progress'; end if;
  wood_due:=wood_cost-coalesce(progress.wood,0); stone_due:=stone_cost-coalesce(progress.stone,0); iron_due:=iron_cost-coalesce(progress.iron,0);
  if coins_before<coin_cost then raise exception 'Not enough coins'; end if; if wood_before<wood_due then raise exception 'Not enough wood'; end if; if stone_before<stone_due then raise exception 'Not enough stone'; end if; if iron_before<iron_due then raise exception 'Not enough iron'; end if;
  update public.player_economy set coins=coins-coin_cost where player_id=pid;
  update public.player_resources set amount=amount-wood_due where player_id=pid and resource='wood';
  update public.player_resources set amount=amount-stone_due where player_id=pid and resource='stone';
  if iron_due>0 then update public.player_resources set amount=amount-iron_due where player_id=pid and resource='iron'; end if;
  update public.properties set level=target_level,storage_capacity=next_storage,resident_capacity=next_residents,business_slots=next_slots where player_id=pid;
  insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values
    (pid,'PROPERTY_UPGRADE_COIN_COST','coins',-coin_cost,coins_before,coins_before-coin_cost,ref),
    (pid,'PROPERTY_LEVEL_CHANGE','property_level',1,current_property.level,target_level,ref);
  if wood_due>0 then insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values(pid,'PROPERTY_UPGRADE_RESOURCE_COST','wood',-wood_due,wood_before,wood_before-wood_due,ref); end if;
  if stone_due>0 then insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values(pid,'PROPERTY_UPGRADE_RESOURCE_COST','stone',-stone_due,stone_before,stone_before-stone_due,ref); end if;
  if iron_due>0 then insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values(pid,'PROPERTY_UPGRADE_RESOURCE_COST','iron',-iron_due,iron_before,iron_before-iron_due,ref); end if;
  delete from public.property_upgrade_progress where player_id=pid;
  request_result:=jsonb_build_object('state',public.get_player_game_state(pid),'message','Property upgraded to level '||target_level,'transactionId',ref);
  update public.action_requests set result=request_result where player_id=pid and idempotency_key=request_key;
  return request_result;
end $$;

revoke execute on function public.calculate_market_unit_price(int,int,int,numeric,numeric) from public,anon;
revoke execute on function public.inventory_storage_used(uuid) from public,anon;
revoke execute on function public.market_trade(text,text,int,uuid) from public,anon;
revoke execute on function public.fund_property_upgrade(int,uuid) from public,anon;
revoke execute on function public.upgrade_property(int,uuid) from public,anon;
grant execute on function public.market_trade(text,text,int,uuid) to authenticated;
grant execute on function public.fund_property_upgrade(int,uuid) to authenticated;
grant execute on function public.upgrade_property(int,uuid) to authenticated;
