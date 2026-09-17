begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(19);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
values('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-111111111111','authenticated','authenticated','m3@example.test',crypt('password',gen_salt('bf')),now(),'{}','{"username":"MarketTester"}',now(),now(),'','','','');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
values('00000000-0000-0000-0000-000000000000','22222222-2222-4222-8222-222222222222','authenticated','authenticated','other@example.test',crypt('password',gen_salt('bf')),now(),'{}','{"username":"OtherTester"}',now(),now(),'','','','');

select is((select coins from public.player_economy where player_id='11111111-1111-4111-8111-111111111111'),500::bigint,'starter account receives 500 Coins');
select is((select storage_capacity from public.properties where player_id='11111111-1111-4111-8111-111111111111'),50,'starter property has 50 storage');

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select is(public.get_player_game_state()->'account'->>'username','MarketTester','authenticated player state loads');
select is((select count(*) from public.profiles where id='22222222-2222-4222-8222-222222222222'),0::bigint,'RLS hides another profile');

select public.set_current_location('forest');
select lives_ok($$select public.execute_job('lumberjack','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,'generalized job executes');
select is((select amount from public.player_resources where player_id=auth.uid() and resource='wood'),8,'job resource balance persists');
select is((select count(*) from public.economy_transactions where player_id=auth.uid()),5::bigint,'job ledger is complete');

select lives_ok($$select public.craft_item('planks','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,'craft executes atomically');
select is((select amount from public.player_resources where player_id=auth.uid() and resource='planks'),2,'crafted output persists');

select public.set_current_location('market');
select lives_ok($$select public.market_trade('market_buy','food',1,'cccccccc-cccc-4ccc-8ccc-cccccccccccc')$$,'market buy executes');
select is((select current_supply from public.market_resources where resource_id='food'),179,'market buy decreases supply');
select is((select count(*) from public.market_transactions where player_id=auth.uid() and side='buy' and resource='food'),1::bigint,'market transaction is recorded once');
select lives_ok($$select public.market_trade('market_sell','food',1,'dddddddd-dddd-4ddd-8ddd-dddddddddddd')$$,'market sell executes');
select is((select current_supply from public.market_resources where resource_id='food'),180,'market sell restores supply');

reset role;
update public.player_economy set coins=2000 where player_id='11111111-1111-4111-8111-111111111111';
update public.player_resources set amount=40 where player_id='11111111-1111-4111-8111-111111111111' and resource='wood';
update public.residents set current_location='home' where player_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select lives_ok($$select public.fund_property_upgrade(2,'f1111111-1111-4111-8111-111111111111')$$,'wood can be reserved for construction');
reset role;
update public.player_resources set amount=25 where player_id='11111111-1111-4111-8111-111111111111' and resource='stone';
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select lives_ok($$select public.fund_property_upgrade(2,'f2222222-2222-4222-8222-222222222222')$$,'stone can be reserved without exceeding storage');
select lives_ok($$select public.upgrade_property(2,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$$,'property upgrade executes');
select is((select storage_capacity from public.properties where player_id=auth.uid()),100,'property upgrade changes capacity');
select public.upgrade_property(2,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
select is((select count(*) from public.economy_transactions where player_id=auth.uid() and transaction_type='PROPERTY_LEVEL_CHANGE'),1::bigint,'idempotent replay creates no duplicate level change');

select * from finish();
rollback;
