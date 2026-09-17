-- Milestone 2: generalized jobs, crafting, meal use, and the first NPC order.
-- All balances are still mutated only inside security-definer transactions.

create table public.npc_orders (
  id text primary key,
  title text not null,
  active boolean not null default true
);

create table public.player_orders (
  player_id uuid not null references public.profiles(id) on delete cascade,
  order_id text not null references public.npc_orders(id),
  completed_at timestamptz not null default now(),
  reference_id uuid not null,
  primary key (player_id, order_id)
);

insert into public.npc_orders(id, title) values ('repair_old_bridge', 'Repair the Old Bridge');
alter table public.npc_orders enable row level security;
alter table public.player_orders enable row level security;
create policy "read active npc orders" on public.npc_orders for select using (active);
create policy "read own order completions" on public.player_orders for select using (player_id = auth.uid());
revoke insert,update,delete on public.npc_orders from authenticated,anon;

create or replace function public.get_player_game_state(target_player uuid default auth.uid()) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'playerId', p.id, 'account', jsonb_build_object('username',p.username,'createdAt',p.created_at),
    'resident', jsonb_build_object('id',r.id,'level',r.level,'xp',r.xp,'energy',r.energy,'maxEnergy',r.max_energy,'currentLocation',r.current_location,'jobsCompleted',r.jobs_completed,'ordersCompleted',r.orders_completed,'tradesCompleted',r.trades_completed),
    'skills', (select jsonb_object_agg(skill,xp) from public.player_skills where player_id=p.id),
    'economy', jsonb_build_object('coins',e.coins),
    'inventory', (select jsonb_object_agg(case when resource='construction_crates' then 'constructionCrates' else resource end,amount) from public.player_resources where player_id=p.id),
    'property', jsonb_build_object('level',pr.level,'storageCapacity',pr.storage_capacity,'residentCapacity',pr.resident_capacity,'businessSlots',pr.business_slots),
    'businesses', coalesce((select jsonb_agg(jsonb_build_object('id',pb.id,'type',pb.business_id,'status',pb.status)) from public.player_businesses pb where pb.player_id=p.id),'[]'::jsonb),
    'season', jsonb_build_object('seasonId',sp.season_id,'founderPoints',sp.founder_points,'streak',sp.streak,'achievements',sp.achievements,'founderSeals',sp.founder_seals,'rank',sp.rank),
    'orders', jsonb_build_object('repairOldBridge', exists(select 1 from public.player_orders po where po.player_id=p.id and po.order_id='repair_old_bridge'))
  ) from public.profiles p join public.residents r on r.player_id=p.id join public.player_economy e on e.player_id=p.id join public.properties pr on pr.player_id=p.id join public.player_season_progress sp on sp.player_id=p.id and sp.season_id='season-0'
  where p.id=target_player and target_player=auth.uid();
$$;

create or replace function public.execute_job(requested_job text, request_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := auth.uid(); resident_id uuid; energy_before int; xp_before int; coins_before bigint;
  primary_before int; secondary_before int; profession_before int; request_result jsonb; existing_action text;
  ref uuid := gen_random_uuid(); action_name text := 'execute_job:' || requested_job;
  required_location public.game_location; skill_name text; profession_resource public.resource_kind;
  energy_cost int; coin_reward int; xp_reward int; profession_reward int := 12;
  primary_resource text; primary_reward int; secondary_resource text; secondary_reward int;
begin
  if pid is null then raise exception 'Authentication required'; end if;
  case requested_job
    when 'lumberjack' then required_location := 'forest'; skill_name := 'lumberjack'; profession_resource := 'lumberjack_xp'; energy_cost := 10; coin_reward := 14; xp_reward := 12; primary_resource := 'wood'; primary_reward := 8;
    when 'miner' then required_location := 'mine'; skill_name := 'miner'; profession_resource := 'miner_xp'; energy_cost := 12; coin_reward := 12; xp_reward := 18; primary_resource := 'stone'; primary_reward := 7; secondary_resource := 'iron'; secondary_reward := 2;
    when 'farmer' then required_location := 'farm'; skill_name := 'farmer'; profession_resource := 'farmer_xp'; energy_cost := 8; coin_reward := 10; xp_reward := 10; primary_resource := 'food'; primary_reward := 6;
    else raise exception 'Unsupported job type';
  end case;
  perform pg_advisory_xact_lock(hashtextextended(pid::text || request_key::text, 0));
  select action,result into existing_action,request_result from public.action_requests where player_id=pid and idempotency_key=request_key;
  if found then
    if existing_action <> action_name then raise exception 'Idempotency key already used for another action'; end if;
    if request_result is not null then return request_result; end if;
  end if;
  insert into public.action_requests(player_id,idempotency_key,action) values(pid,request_key,action_name);
  select id,energy,xp into resident_id,energy_before,xp_before from public.residents where player_id=pid and current_location=required_location for update;
  if resident_id is null then raise exception 'Resident must be at the correct job location'; end if;
  if energy_before < energy_cost then raise exception 'Not enough energy'; end if;
  select coins into coins_before from public.player_economy where player_id=pid for update;
  select amount into primary_before from public.player_resources where player_id=pid and resource=primary_resource for update;
  if secondary_resource is not null then select amount into secondary_before from public.player_resources where player_id=pid and resource=secondary_resource for update; end if;
  select xp into profession_before from public.player_skills where player_id=pid and skill=skill_name for update;
  update public.residents set energy=energy-energy_cost,xp=xp+xp_reward,level=1+((xp+xp_reward)/100),jobs_completed=jobs_completed+1 where id=resident_id;
  update public.player_economy set coins=coins+coin_reward where player_id=pid;
  update public.player_resources set amount=amount+primary_reward where player_id=pid and resource=primary_resource;
  if secondary_resource is not null then update public.player_resources set amount=amount+secondary_reward where player_id=pid and resource=secondary_resource; end if;
  update public.player_skills set xp=xp+profession_reward where player_id=pid and skill=skill_name;
  insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values
    (pid,'JOB_ENERGY_COST','energy',-energy_cost,energy_before,energy_before-energy_cost,ref),
    (pid,'JOB_REWARD','coins',coin_reward,coins_before,coins_before+coin_reward,ref),
    (pid,'JOB_REWARD','xp',xp_reward,xp_before,xp_before+xp_reward,ref),
    (pid,'JOB_REWARD',profession_resource,profession_reward,profession_before,profession_before+profession_reward,ref),
    (pid,'JOB_REWARD',primary_resource::public.resource_kind,primary_reward,primary_before,primary_before+primary_reward,ref);
  if secondary_resource is not null then insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values (pid,'JOB_REWARD',secondary_resource::public.resource_kind,secondary_reward,secondary_before,secondary_before+secondary_reward,ref); end if;
  request_result := jsonb_build_object('state',public.get_player_game_state(pid),'message','Job complete','transactionId',ref);
  update public.action_requests set result=request_result where player_id=pid and idempotency_key=request_key;
  return request_result;
end $$;

create or replace function public.craft_item(requested_recipe text, request_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := auth.uid(); request_result jsonb; existing_action text; ref uuid := gen_random_uuid(); action_name text := 'craft_item:' || requested_recipe;
  coins_before bigint; coin_cost int; input_one text; input_one_cost int; input_one_before int;
  input_two text; input_two_cost int; input_two_before int; output_resource text; output_amount int; output_before int;
begin
  if pid is null then raise exception 'Authentication required'; end if;
  case requested_recipe
    when 'planks' then coin_cost:=5; input_one:='wood'; input_one_cost:=5; output_resource:='planks'; output_amount:=2;
    when 'meal' then coin_cost:=5; input_one:='food'; input_one_cost:=3; output_resource:='meals'; output_amount:=1;
    when 'tool' then coin_cost:=15; input_one:='iron'; input_one_cost:=3; input_two:='wood'; input_two_cost:=2; output_resource:='tools'; output_amount:=1;
    else raise exception 'Unsupported recipe';
  end case;
  perform pg_advisory_xact_lock(hashtextextended(pid::text || request_key::text, 0));
  select action,result into existing_action,request_result from public.action_requests where player_id=pid and idempotency_key=request_key;
  if found then if existing_action<>action_name then raise exception 'Idempotency key already used for another action'; end if; if request_result is not null then return request_result; end if; end if;
  insert into public.action_requests(player_id,idempotency_key,action) values(pid,request_key,action_name);
  select coins into coins_before from public.player_economy where player_id=pid for update;
  if coins_before < coin_cost then raise exception 'Not enough coins'; end if;
  select amount into input_one_before from public.player_resources where player_id=pid and resource=input_one for update;
  if input_one_before < input_one_cost then raise exception 'Not enough %', input_one; end if;
  if input_two is not null then select amount into input_two_before from public.player_resources where player_id=pid and resource=input_two for update; if input_two_before < input_two_cost then raise exception 'Not enough %', input_two; end if; end if;
  select amount into output_before from public.player_resources where player_id=pid and resource=output_resource for update;
  update public.player_economy set coins=coins-coin_cost where player_id=pid;
  update public.player_resources set amount=amount-input_one_cost where player_id=pid and resource=input_one;
  if input_two is not null then update public.player_resources set amount=amount-input_two_cost where player_id=pid and resource=input_two; end if;
  update public.player_resources set amount=amount+output_amount where player_id=pid and resource=output_resource;
  insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values
    (pid,'CRAFT_COIN_COST','coins',-coin_cost,coins_before,coins_before-coin_cost,ref),
    (pid,'CRAFT_RESOURCE_COST',input_one::public.resource_kind,-input_one_cost,input_one_before,input_one_before-input_one_cost,ref),
    (pid,'CRAFT_OUTPUT',output_resource::public.resource_kind,output_amount,output_before,output_before+output_amount,ref);
  if input_two is not null then insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values (pid,'CRAFT_RESOURCE_COST',input_two::public.resource_kind,-input_two_cost,input_two_before,input_two_before-input_two_cost,ref); end if;
  request_result := jsonb_build_object('state',public.get_player_game_state(pid),'message','Crafting complete','transactionId',ref);
  update public.action_requests set result=request_result where player_id=pid and idempotency_key=request_key;
  return request_result;
end $$;

create or replace function public.use_meal(request_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pid uuid:=auth.uid(); request_result jsonb; existing_action text; ref uuid:=gen_random_uuid(); energy_before int; max_energy_value int; meal_before int; restored int;
begin
  if pid is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(pid::text || request_key::text, 0));
  select action,result into existing_action,request_result from public.action_requests where player_id=pid and idempotency_key=request_key;
  if found then if existing_action<>'use_meal' then raise exception 'Idempotency key already used for another action'; end if; if request_result is not null then return request_result; end if; end if;
  insert into public.action_requests(player_id,idempotency_key,action) values(pid,request_key,'use_meal');
  select energy,max_energy into energy_before,max_energy_value from public.residents where player_id=pid for update;
  if energy_before >= max_energy_value then raise exception 'Energy is already full'; end if;
  select amount into meal_before from public.player_resources where player_id=pid and resource='meals' for update;
  if meal_before < 1 then raise exception 'No meals available'; end if;
  restored := least(20,max_energy_value-energy_before);
  update public.residents set energy=energy+restored where player_id=pid;
  update public.player_resources set amount=amount-1 where player_id=pid and resource='meals';
  insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values
    (pid,'MEAL_CONSUME','meals',-1,meal_before,meal_before-1,ref),(pid,'ENERGY_RESTORE','energy',restored,energy_before,energy_before+restored,ref);
  request_result:=jsonb_build_object('state',public.get_player_game_state(pid),'message','Meal used: energy restored','transactionId',ref);
  update public.action_requests set result=request_result where player_id=pid and idempotency_key=request_key;
  return request_result;
end $$;

create or replace function public.complete_npc_order(requested_order text, request_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pid uuid:=auth.uid(); resident_id uuid; request_result jsonb; existing_action text; ref uuid:=gen_random_uuid(); action_name text:='complete_order:'||requested_order;
  wood_before int; stone_before int; coins_before bigint; xp_before int; fp_before int;
begin
  if pid is null then raise exception 'Authentication required'; end if;
  if requested_order<>'repair_old_bridge' then raise exception 'Unsupported order'; end if;
  perform pg_advisory_xact_lock(hashtextextended(pid::text || request_key::text, 0));
  select action,result into existing_action,request_result from public.action_requests where player_id=pid and idempotency_key=request_key;
  if found then if existing_action<>action_name then raise exception 'Idempotency key already used for another action'; end if; if request_result is not null then return request_result; end if; end if;
  if exists(select 1 from public.player_orders where player_id=pid and order_id=requested_order) then raise exception 'Order already completed'; end if;
  insert into public.action_requests(player_id,idempotency_key,action) values(pid,request_key,action_name);
  select id,xp into resident_id,xp_before from public.residents where player_id=pid and current_location='town-hall' for update;
  if resident_id is null then raise exception 'Resident must be at Town Hall'; end if;
  select amount into wood_before from public.player_resources where player_id=pid and resource='wood' for update;
  select amount into stone_before from public.player_resources where player_id=pid and resource='stone' for update;
  if wood_before<16 then raise exception 'Not enough wood'; end if; if stone_before<14 then raise exception 'Not enough stone'; end if;
  select coins into coins_before from public.player_economy where player_id=pid for update;
  select founder_points into fp_before from public.player_season_progress where player_id=pid and season_id='season-0' for update;
  update public.player_resources set amount=amount-16 where player_id=pid and resource='wood';
  update public.player_resources set amount=amount-14 where player_id=pid and resource='stone';
  update public.player_economy set coins=coins+180 where player_id=pid;
  update public.residents set xp=xp+40,level=1+((xp+40)/100),orders_completed=orders_completed+1 where player_id=pid;
  update public.player_season_progress set founder_points=founder_points+15 where player_id=pid and season_id='season-0';
  insert into public.player_orders(player_id,order_id,reference_id) values(pid,requested_order,ref);
  insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values
    (pid,'NPC_ORDER_RESOURCE_COST','wood',-16,wood_before,wood_before-16,ref),(pid,'NPC_ORDER_RESOURCE_COST','stone',-14,stone_before,stone_before-14,ref),
    (pid,'NPC_ORDER_REWARD','coins',180,coins_before,coins_before+180,ref),(pid,'NPC_ORDER_REWARD','xp',40,xp_before,xp_before+40,ref),
    (pid,'FOUNDER_POINTS_REWARD','founder_points',15,fp_before,fp_before+15,ref);
  request_result:=jsonb_build_object('state',public.get_player_game_state(pid),'message','Old Bridge repaired: +180 coins, +40 XP, +15 FP','transactionId',ref);
  update public.action_requests set result=request_result where player_id=pid and idempotency_key=request_key;
  return request_result;
end $$;

revoke execute on function public.execute_job(text,uuid) from public,anon;
revoke execute on function public.craft_item(text,uuid) from public,anon;
revoke execute on function public.use_meal(uuid) from public,anon;
revoke execute on function public.complete_npc_order(text,uuid) from public,anon;
grant execute on function public.execute_job(text,uuid) to authenticated;
grant execute on function public.craft_item(text,uuid) to authenticated;
grant execute on function public.use_meal(uuid) to authenticated;
grant execute on function public.complete_npc_order(text,uuid) to authenticated;
revoke execute on function public.perform_lumberjack_job(uuid) from public,anon,authenticated;
revoke insert,update,delete on public.player_orders from authenticated,anon;
