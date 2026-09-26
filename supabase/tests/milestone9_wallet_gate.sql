begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(18);

select has_table('public','wallet_identities','wallet identity mapping exists');
select has_table('public','citizen_access_grants','short-lived citizen grants exist');
select has_function('public','enforce_citizen_economy_access',array[]::text[],'database economy gate exists');

select lives_ok($$insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
values('00000000-0000-0000-0000-000000000000','99999999-9999-4999-8999-999999999991','authenticated','authenticated',null,'',now(),'{"provider":"web3"}','{"address":"0x1111111111111111111111111111111111111111","chain":"ethereum","network":"4663"}',now(),now(),'','','','')$$,'verified Web3 metadata provisions a player');
select is((select wallet_address from public.wallet_identities where user_id='99999999-9999-4999-8999-999999999991'),'0x1111111111111111111111111111111111111111','wallet address is normalized and mapped');
select is(has_table_privilege('authenticated','public.citizen_access_grants','INSERT'),false,'authenticated cannot insert Citizen grants');
select is(has_table_privilege('authenticated','public.citizen_access_grants','UPDATE'),false,'authenticated cannot extend Citizen grants');
select is(has_function_privilege('authenticated','public.enforce_citizen_economy_access()','EXECUTE'),false,'economy gate function is not callable by authenticated');

-- Prepare the existing server-authoritative job path while no player JWT is
-- active. Direct client table mutation remains intentionally unavailable.
update public.residents set current_location='forest'
where player_id='99999999-9999-4999-8999-999999999991';

select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999991',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select throws_like($$insert into public.citizen_access_grants(user_id,wallet_address,chain_id,contract_address,nft_balance,verified_at,expires_at) values('99999999-9999-4999-8999-999999999991','0x1111111111111111111111111111111111111111',4663,'0x2222222222222222222222222222222222222222',1,now(),now()+interval '1 year')$$,'%permission denied%','direct grant insert is rejected');
select throws_like($$update public.citizen_access_grants set expires_at=now()+interval '1 year' where user_id='99999999-9999-4999-8999-999999999991'$$,'%permission denied%','direct grant extension is rejected');
select throws_like($$update public.player_economy set coins=coins+1 where player_id='99999999-9999-4999-8999-999999999991'$$,'%permission denied%','authenticated direct economy mutation is rejected by table ACL');
select throws_like($$select public.execute_job('lumberjack','99999999-9999-4999-8999-999999999901')$$,'%CITIZEN_NFT_REQUIRED%','authenticated wallet cannot use economy RPC without a grant');
select throws_like($$update public.player_economy set coins=coins+1 where player_id='00000000-0000-0000-0000-000000000001'$$,'%permission denied%','authenticated wallet cannot spoof another player');
reset role;

insert into public.citizen_access_grants(user_id,wallet_address,chain_id,contract_address,nft_balance,verified_at,expires_at)
values('99999999-9999-4999-8999-999999999991','0x1111111111111111111111111111111111111111',4663,'0x2222222222222222222222222222222222222222',1,now(),now()+interval '60 seconds');
set local role authenticated;
select lives_ok($$select public.execute_job('lumberjack','99999999-9999-4999-8999-999999999902')$$,'fresh citizen grant permits the existing economy RPC path');
reset role;
update public.citizen_access_grants set expires_at=now()-interval '1 second',verified_at=now()-interval '2 seconds' where user_id='99999999-9999-4999-8999-999999999991';
set local role authenticated;
select throws_like($$select public.execute_job('lumberjack','99999999-9999-4999-8999-999999999903')$$,'%CITIZEN_NFT_REQUIRED%','expired grant revokes economy RPC access');
reset role;

set local role anon;
select throws_like($$update public.player_economy set coins=coins+1 where player_id='99999999-9999-4999-8999-999999999991'$$,'%permission denied%','anonymous economy mutation is rejected');
reset role;
select has_trigger('public','achievement_claims','citizen_economy_gate','achievement claims are covered by the economy gate');
select has_trigger('public','founder_point_history','citizen_economy_gate','Founder Point history is covered by the economy gate');

select * from finish();
rollback;
