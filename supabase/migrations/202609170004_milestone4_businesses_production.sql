-- Milestone 4: persistent businesses, resident assignment, and server-timed production.
insert into public.businesses(id,name,enabled) values('workshop','Workshop',true) on conflict(id) do nothing;
insert into public.quests(id,title,target,founder_points,active) values('daily-business-1','Run 1 Business Production',1,10,true) on conflict(id) do nothing;

alter table public.player_businesses add column if not exists property_player_id uuid references public.properties(player_id) on delete cascade;
update public.player_businesses set property_player_id=player_id where property_player_id is null;
alter table public.player_businesses alter column property_player_id set not null;
alter table public.player_businesses add column if not exists assigned_resident_id uuid references public.residents(id);
alter table public.player_businesses add column if not exists opened_at timestamptz not null default now();
alter table public.player_businesses alter column status set default 'ACTIVE';
update public.player_businesses set status=upper(status);
alter table public.player_businesses add constraint player_business_status_check check(status in('ACTIVE','INACTIVE'));
create unique index player_business_type_unique on public.player_businesses(player_id,business_id);
create unique index player_business_resident_unique on public.player_businesses(assigned_resident_id) where assigned_resident_id is not null;

alter table public.residents add column if not exists work_state text not null default 'IDLE' check(work_state in('IDLE','TRAVELING','WORKING_JOB','ASSIGNED_BUSINESS','PRODUCING'));
alter table public.residents add column if not exists assigned_business_id uuid references public.player_businesses(id);

create table public.business_productions(
 id uuid primary key default gen_random_uuid(), player_id uuid not null references public.profiles(id) on delete cascade,
 business_id uuid not null references public.player_businesses(id) on delete cascade, resident_id uuid not null references public.residents(id),
 recipe_id text not null check(recipe_id in('general_store_sales','restaurant_meals','workshop_tools')),
 status text not null default 'RUNNING' check(status in('RUNNING','CLAIMED')), started_at timestamptz not null, ready_at timestamptz not null,
 claimed_at timestamptz, reference_id uuid not null unique, gross_coins int, tax_coins int, net_coins int, check(ready_at>started_at)
);
create unique index one_active_business_production on public.business_productions(business_id) where status='RUNNING';
create unique index one_active_resident_production on public.business_productions(resident_id) where status='RUNNING';
create table public.production_output_reservations(
 production_id uuid primary key references public.business_productions(id) on delete cascade,
 player_id uuid not null references public.profiles(id) on delete cascade, units int not null check(units>0), resource text not null check(resource in('meals','tools')), created_at timestamptz not null default now()
);
create table public.business_tax_totals(id boolean primary key default true check(id),coins_removed bigint not null default 0 check(coins_removed>=0),updated_at timestamptz not null default now());
insert into public.business_tax_totals(id) values(true);
create table public.business_events(id uuid primary key default gen_random_uuid(),player_id uuid not null references public.profiles(id),production_id uuid references public.business_productions(id),event_type text not null check(event_type in('BUSINESS_GROSS_REVENUE','BUSINESS_TAX')),amount bigint not null check(amount>=0),reference_id uuid not null,created_at timestamptz not null default now(),unique(production_id,event_type));
create trigger business_events_immutable before update or delete on public.business_events for each row execute procedure public.reject_ledger_mutation();

alter table public.business_productions enable row level security;
alter table public.production_output_reservations enable row level security;
alter table public.business_tax_totals enable row level security;
alter table public.business_events enable row level security;
create policy "read own productions" on public.business_productions for select using(player_id=auth.uid());
create policy "read own production reservations" on public.production_output_reservations for select using(player_id=auth.uid());
create policy "authenticated read business tax sink" on public.business_tax_totals for select to authenticated using(true);
create policy "read own business events" on public.business_events for select using(player_id=auth.uid());
revoke insert,update,delete on public.player_businesses,public.business_productions,public.production_output_reservations,public.business_tax_totals,public.business_events from authenticated,anon;

create or replace function public.production_reserved_storage(target_player uuid) returns int language sql stable security definer set search_path='' as $$
 select coalesce(sum(units),0)::int from public.production_output_reservations where player_id=target_player;
$$;
create or replace function public.effective_storage_used(target_player uuid) returns int language sql stable security definer set search_path='' as $$
 select public.inventory_storage_used(target_player)+public.production_reserved_storage(target_player);
$$;
create or replace function public.enforce_inventory_storage() returns trigger language plpgsql security definer set search_path='' as $$
declare capacity int; used int;
begin
 if new.amount<=old.amount then return new; end if;
 select storage_capacity into capacity from public.properties where player_id=new.player_id;
 select public.effective_storage_used(new.player_id) into used;
 if capacity is null then raise exception 'Property storage not found'; end if;
 if used-old.amount+new.amount>capacity then raise exception 'Storage capacity exceeded (% / %)',used-old.amount+new.amount,capacity; end if;
 return new;
end $$;
create or replace function public.prevent_job_while_producing() returns trigger language plpgsql set search_path='' as $$
begin if old.work_state='PRODUCING' and new.jobs_completed>old.jobs_completed then raise exception 'RESIDENT_PRODUCING'; end if; return new; end $$;
create trigger prevent_job_while_producing before update on public.residents for each row execute procedure public.prevent_job_while_producing();

create or replace function public.get_player_game_state(target_player uuid default auth.uid()) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'playerId',p.id,'account',jsonb_build_object('username',p.username,'createdAt',p.created_at),
 'resident',jsonb_build_object('id',r.id,'level',r.level,'xp',r.xp,'energy',r.energy,'maxEnergy',r.max_energy,'currentLocation',r.current_location,'jobsCompleted',r.jobs_completed,'ordersCompleted',r.orders_completed,'tradesCompleted',r.trades_completed,'workState',r.work_state,'assignedBusinessId',r.assigned_business_id,'activeProductionId',(select bp.id from public.business_productions bp where bp.resident_id=r.id and bp.status='RUNNING' limit 1)),
 'skills',(select jsonb_object_agg(skill,xp) from public.player_skills where player_id=p.id),'economy',jsonb_build_object('coins',e.coins),
 'inventory',(select jsonb_object_agg(case when resource='construction_crates' then 'constructionCrates' else resource end,amount) from public.player_resources where player_id=p.id),
 'property',jsonb_build_object('level',pr.level,'storageCapacity',pr.storage_capacity,'storageUsed',public.inventory_storage_used(p.id),'reservedProductionStorage',public.production_reserved_storage(p.id),'effectiveStorageUsed',public.effective_storage_used(p.id),'residentCapacity',pr.resident_capacity,'businessSlots',pr.business_slots,'businessSlotsUsed',(select count(*) from public.player_businesses pb where pb.player_id=p.id and pb.status='ACTIVE'),'upgradeProgress',coalesce((select jsonb_build_object('targetLevel',u.target_level,'wood',u.wood,'stone',u.stone,'iron',u.iron) from public.property_upgrade_progress u where u.player_id=p.id),jsonb_build_object('targetLevel',null,'wood',0,'stone',0,'iron',0))),
 'businesses',coalesce((select jsonb_agg(jsonb_build_object('id',pb.id,'type',pb.business_id,'status',pb.status,'assignedResidentId',pb.assigned_resident_id,'openedAt',pb.opened_at,'production',(select jsonb_build_object('id',bp.id,'businessId',bp.business_id,'recipeId',bp.recipe_id,'state',case when bp.status='RUNNING' and now()>=bp.ready_at then 'READY' else bp.status end,'startedAt',bp.started_at,'readyAt',bp.ready_at,'claimedAt',bp.claimed_at,'reservedStorage',coalesce((select units from public.production_output_reservations por where por.production_id=bp.id),0)) from public.business_productions bp where bp.business_id=pb.id and bp.status='RUNNING' limit 1)) order by pb.opened_at) from public.player_businesses pb where pb.player_id=p.id),'[]'::jsonb),
 'season',jsonb_build_object('seasonId',sp.season_id,'founderPoints',sp.founder_points,'streak',sp.streak,'achievements',sp.achievements,'founderSeals',sp.founder_seals,'rank',sp.rank),
 'orders',jsonb_build_object('repairOldBridge',exists(select 1 from public.player_orders po where po.player_id=p.id and po.order_id='repair_old_bridge')),
 'market',jsonb_build_object('resources',coalesce((select jsonb_agg(jsonb_build_object('resourceId',mr.resource_id,'basePrice',mr.base_price,'currentPrice',public.calculate_market_unit_price(mr.base_price,mr.current_supply,mr.initial_supply,mr.min_multiplier,mr.max_multiplier),'currentSupply',mr.current_supply,'initialSupply',mr.initial_supply,'minMultiplier',mr.min_multiplier,'maxMultiplier',mr.max_multiplier) order by mr.resource_id) from public.market_resources mr),'[]'::jsonb),'recentTransactions',coalesce((select jsonb_agg(x) from(select jsonb_build_object('id',mt.id,'side',mt.side,'resource',mt.resource,'quantity',mt.quantity,'unitPrice',mt.unit_price,'gross',mt.gross,'fee',mt.fee,'net',mt.net,'createdAt',mt.created_at) x from public.market_transactions mt where mt.player_id=p.id order by mt.created_at desc limit 10)s),'[]'::jsonb))
 ) from public.profiles p join public.residents r on r.player_id=p.id join public.player_economy e on e.player_id=p.id join public.properties pr on pr.player_id=p.id join public.player_season_progress sp on sp.player_id=p.id and sp.season_id='season-0' where p.id=target_player and target_player=auth.uid();
$$;

create or replace function public.open_business(requested_business_type text,request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=auth.uid(); cost int; slots int; used int; coins_before bigint; ref uuid:=gen_random_uuid(); result jsonb; old_action text; business_row uuid; action_name text:='open_business:'||requested_business_type;
begin
 if pid is null then raise exception 'Authentication required'; end if; if requested_business_type not in('general_store','restaurant','workshop') then raise exception 'Unsupported business type'; end if;
 cost:=case requested_business_type when 'general_store' then 600 when 'restaurant' then 700 else 900 end;
 perform pg_advisory_xact_lock(hashtextextended(pid::text,41)); select ar.action,ar.result into old_action,result from public.action_requests ar where ar.player_id=pid and ar.idempotency_key=request_key; if found then if old_action<>action_name then raise exception 'Idempotency key already used for another action'; end if; return result; end if;
 select business_slots into slots from public.properties where player_id=pid for update; select count(*) into used from public.player_businesses where player_id=pid and status='ACTIVE'; if used>=slots then raise exception 'No business slot available'; end if; if exists(select 1 from public.player_businesses where player_id=pid and business_id=requested_business_type) then raise exception 'Business type already owned'; end if;
 select coins into coins_before from public.player_economy where player_id=pid for update; if coins_before<cost then raise exception 'Not enough coins'; end if;
 insert into public.action_requests values(pid,request_key,action_name,null,now()); update public.player_economy set coins=coins-cost where player_id=pid; insert into public.player_businesses(player_id,business_id,status,property_player_id) values(pid,requested_business_type,'ACTIVE',pid) returning id into business_row;
 insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values(pid,'BUSINESS_OPEN_COST','coins',-cost,coins_before,coins_before-cost,ref);
 result:=jsonb_build_object('state',public.get_player_game_state(pid),'message','Business opened','transactionId',ref); update public.action_requests set result=result where player_id=pid and idempotency_key=request_key; return result;
end $$;

create or replace function public.assign_resident_to_business(requested_resident uuid,requested_business uuid,request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=auth.uid(); result jsonb; old_action text; state text; action_name text:='assign_business:'||requested_business;
begin
 if pid is null then raise exception 'Authentication required'; end if; perform pg_advisory_xact_lock(hashtextextended(pid::text,42)); select ar.action,ar.result into old_action,result from public.action_requests ar where ar.player_id=pid and ar.idempotency_key=request_key; if found then if old_action<>action_name then raise exception 'Idempotency key already used for another action'; end if; return result; end if;
 select work_state into state from public.residents where id=requested_resident and player_id=pid for update; if state is null then raise exception 'Resident not owned'; end if; if state='PRODUCING' then raise exception 'Resident is producing'; end if; if exists(select 1 from public.player_businesses where assigned_resident_id=requested_resident) then raise exception 'Resident already assigned'; end if;
 perform 1 from public.player_businesses where id=requested_business and player_id=pid and assigned_resident_id is null for update; if not found then raise exception 'Business unavailable or already assigned'; end if;
 insert into public.action_requests values(pid,request_key,action_name,null,now()); update public.player_businesses set assigned_resident_id=requested_resident where id=requested_business; update public.residents set assigned_business_id=requested_business,work_state='ASSIGNED_BUSINESS' where id=requested_resident;
 result:=jsonb_build_object('state',public.get_player_game_state(pid),'message','Resident assigned'); update public.action_requests set result=result where player_id=pid and idempotency_key=request_key; return result;
end $$;

create or replace function public.unassign_resident_from_business(requested_resident uuid,requested_business uuid,request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=auth.uid(); result jsonb; old_action text; action_name text:='unassign_business:'||requested_business;
begin
 if pid is null then raise exception 'Authentication required'; end if; perform pg_advisory_xact_lock(hashtextextended(pid::text,43)); select ar.action,ar.result into old_action,result from public.action_requests ar where ar.player_id=pid and ar.idempotency_key=request_key; if found then if old_action<>action_name then raise exception 'Idempotency key already used for another action'; end if; return result; end if;
 perform 1 from public.player_businesses pb join public.residents r on r.id=pb.assigned_resident_id where pb.id=requested_business and pb.player_id=pid and r.id=requested_resident for update of pb,r; if not found then raise exception 'Assignment not found'; end if; if exists(select 1 from public.business_productions where business_id=requested_business and status='RUNNING') then raise exception 'PRODUCTION_ACTIVE'; end if;
 insert into public.action_requests values(pid,request_key,action_name,null,now()); update public.player_businesses set assigned_resident_id=null where id=requested_business; update public.residents set assigned_business_id=null,work_state='IDLE' where id=requested_resident;
 result:=jsonb_build_object('state',public.get_player_game_state(pid),'message','Resident unassigned'); update public.action_requests set result=result where player_id=pid and idempotency_key=request_key; return result;
end $$;

create or replace function public.start_business_production(requested_business uuid,requested_recipe text,request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=auth.uid(); btype text; resident uuid; state text; duration interval; reserve_units int; first_resource text; first_amount int; second_resource text; second_amount int; before_first int; before_second int; capacity int; ref uuid:=gen_random_uuid(); production uuid; result jsonb; old_action text; action_name text:='start_production:'||requested_business||':'||requested_recipe;
begin
 if pid is null then raise exception 'Authentication required'; end if; perform pg_advisory_xact_lock(hashtextextended(pid::text,44)); select ar.action,ar.result into old_action,result from public.action_requests ar where ar.player_id=pid and ar.idempotency_key=request_key; if found then if old_action<>action_name then raise exception 'Idempotency key already used for another action'; end if; return result; end if;
 select business_id,assigned_resident_id into btype,resident from public.player_businesses where id=requested_business and player_id=pid and status='ACTIVE' for update; if btype is null then raise exception 'Business not owned'; end if; if resident is null then raise exception 'Resident required'; end if;
 if (btype='general_store' and requested_recipe<>'general_store_sales') or (btype='restaurant' and requested_recipe<>'restaurant_meals') or (btype='workshop' and requested_recipe<>'workshop_tools') then raise exception 'Recipe does not belong to business'; end if;
 select work_state into state from public.residents where id=resident and player_id=pid for update; if state='PRODUCING' then raise exception 'Resident already producing'; end if; if exists(select 1 from public.business_productions where business_id=requested_business and status='RUNNING') then raise exception 'Production already active'; end if;
 if btype='general_store' then duration:=interval '15 minutes'; reserve_units:=0; first_resource:='wood';first_amount:=3;second_resource:='food';second_amount:=2; elsif btype='restaurant' then duration:=interval '20 minutes';reserve_units:=2;first_resource:='food';first_amount:=4; else duration:=interval '30 minutes';reserve_units:=1;first_resource:='wood';first_amount:=4;second_resource:='iron';second_amount:=2; end if;
 select storage_capacity into capacity from public.properties where player_id=pid for update; if public.effective_storage_used(pid)+reserve_units>capacity then raise exception 'Storage capacity exceeded'; end if;
 select amount into before_first from public.player_resources where player_id=pid and resource=first_resource for update; if before_first<first_amount then raise exception 'Not enough %',first_resource; end if; if second_resource is not null then select amount into before_second from public.player_resources where player_id=pid and resource=second_resource for update; if before_second<second_amount then raise exception 'Not enough %',second_resource; end if; end if;
 insert into public.action_requests values(pid,request_key,action_name,null,now()); update public.player_resources set amount=amount-first_amount where player_id=pid and resource=first_resource; if second_resource is not null then update public.player_resources set amount=amount-second_amount where player_id=pid and resource=second_resource; end if;
 insert into public.business_productions(player_id,business_id,resident_id,recipe_id,started_at,ready_at,reference_id) values(pid,requested_business,resident,requested_recipe,clock_timestamp(),clock_timestamp()+duration,ref) returning id into production;
 if reserve_units>0 then insert into public.production_output_reservations values(production,pid,reserve_units,case when btype='restaurant' then 'meals' else 'tools' end,now()); end if; update public.residents set work_state='PRODUCING' where id=resident;
 insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values(pid,'BUSINESS_INPUT_RESOURCE',first_resource::public.resource_kind,-first_amount,before_first,before_first-first_amount,ref); if second_resource is not null then insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values(pid,'BUSINESS_INPUT_RESOURCE',second_resource::public.resource_kind,-second_amount,before_second,before_second-second_amount,ref); end if;
 result:=jsonb_build_object('state',public.get_player_game_state(pid),'message','Production started','transactionId',ref); update public.action_requests set result=result where player_id=pid and idempotency_key=request_key; return result;
end $$;

create or replace function public.claim_business_production(requested_production uuid,request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=auth.uid(); row_data public.business_productions%rowtype; btype text; output_resource text; output_amount int; output_before int; coins_before bigint; gross int:=0; tax int:=0; net int:=0; profession text; profession_before int; xp_reward int; xp_before int; ref uuid:=gen_random_uuid(); result jsonb; old_action text; action_name text:='claim_production:'||requested_production;
begin
 if pid is null then raise exception 'Authentication required'; end if; perform pg_advisory_xact_lock(hashtextextended(pid::text,45)); select ar.action,ar.result into old_action,result from public.action_requests ar where ar.player_id=pid and ar.idempotency_key=request_key; if found then if old_action<>action_name then raise exception 'Idempotency key already used for another action'; end if; return result; end if;
 select * into row_data from public.business_productions where id=requested_production and player_id=pid for update; if not found then raise exception 'Production not found'; end if; if row_data.status='CLAIMED' then raise exception 'Production already claimed'; end if; if clock_timestamp()<row_data.ready_at then raise exception 'PRODUCTION_NOT_READY ready_at=%',row_data.ready_at; end if;
 select business_id into btype from public.player_businesses where id=row_data.business_id and player_id=pid for update; if btype='general_store' then gross:=75;tax:=ceil(gross*.05);net:=gross-tax;profession:='merchant';xp_reward:=10; elsif btype='restaurant' then output_resource:='meals';output_amount:=2;profession:='chef';xp_reward:=12; else output_resource:='tools';output_amount:=1;profession:='engineer';xp_reward:=15; end if;
 select xp into xp_before from public.residents where id=row_data.resident_id for update; select xp into profession_before from public.player_skills where player_id=pid and skill=profession for update; insert into public.action_requests values(pid,request_key,action_name,null,now());
 if btype='general_store' then select coins into coins_before from public.player_economy where player_id=pid for update; update public.player_economy set coins=coins+net where player_id=pid; update public.business_tax_totals set coins_removed=coins_removed+tax,updated_at=now() where id; update public.business_productions set gross_coins=gross,tax_coins=tax,net_coins=net where id=requested_production; insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values(pid,'BUSINESS_NET_REVENUE','coins',net,coins_before,coins_before+net,ref); insert into public.business_events(player_id,production_id,event_type,amount,reference_id) values(pid,requested_production,'BUSINESS_GROSS_REVENUE',gross,ref),(pid,requested_production,'BUSINESS_TAX',tax,ref); else select amount into output_before from public.player_resources where player_id=pid and resource=output_resource for update; delete from public.production_output_reservations where production_id=requested_production; update public.player_resources set amount=amount+output_amount where player_id=pid and resource=output_resource; insert into public.economy_transactions(player_id,transaction_type,resource,amount,balance_before,balance_after,reference_id) values(pid,'BUSINESS_OUTPUT_RESOURCE',output_resource::public.resource_kind,output_amount,output_before,output_before+output_amount,ref); end if;
 update public.residents set xp=xp+xp_reward,level=1+((xp+xp_reward)/100),work_state='ASSIGNED_BUSINESS' where id=row_data.resident_id; update public.player_skills set xp=xp+12 where player_id=pid and skill=profession; update public.business_productions set status='CLAIMED',claimed_at=clock_timestamp() where id=requested_production;
 insert into public.player_quests(player_id,quest_id,progress,quest_date) values(pid,'daily-business-1',1,current_date) on conflict(player_id,quest_id,quest_date) do update set progress=greatest(public.player_quests.progress,1);
 result:=jsonb_build_object('state',public.get_player_game_state(pid),'message','Production claimed','transactionId',ref); update public.action_requests set result=result where player_id=pid and idempotency_key=request_key; return result;
end $$;

revoke execute on function public.production_reserved_storage(uuid),public.effective_storage_used(uuid),public.open_business(text,uuid),public.assign_resident_to_business(uuid,uuid,uuid),public.unassign_resident_from_business(uuid,uuid,uuid),public.start_business_production(uuid,text,uuid),public.claim_business_production(uuid,uuid) from public,anon;
grant execute on function public.open_business(text,uuid),public.assign_resident_to_business(uuid,uuid,uuid),public.unassign_resident_from_business(uuid,uuid,uuid),public.start_business_production(uuid,text,uuid),public.claim_business_production(uuid,uuid) to authenticated;
