begin;
set local app.allow_legacy_alpha_testers='on';
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(10);

select has_function('public','is_alpha_email_approved',array['text'],'invite preflight exists');
select is(public.is_alpha_email_approved('missing@alpha.test'),false,'uninvited email is not approved');
select throws_like($$insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)values('00000000-0000-0000-0000-000000000000','88888888-8888-4888-8888-888888888880','authenticated','authenticated','missing@alpha.test',crypt('password',gen_salt('bf')),now(),'{}','{"username":"MissingInvite"}',now(),now(),'','','','')$$,'%ALPHA_INVITE_REQUIRED%','uninvited signup is rejected');

insert into public.alpha_invites(email,label) values('invited@alpha.test','pgTAP signup');
select is(public.is_alpha_email_approved('INVITED@alpha.test'),true,'invite lookup normalizes email case');
select lives_ok($$insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)values('00000000-0000-0000-0000-000000000000','88888888-8888-4888-8888-888888888881','authenticated','authenticated','invited@alpha.test',crypt('password',gen_salt('bf')),now(),'{}','{"username":"InvitedFounder"}',now(),now(),'','','','')$$,'invited signup succeeds');
select is((select username from public.profiles where id='88888888-8888-4888-8888-888888888881'),'InvitedFounder','signup initializes the profile from username metadata');
select is((select count(*) from public.player_resources where player_id='88888888-8888-4888-8888-888888888881'),8::bigint,'signup initializes player resources');
select ok((select not active and registered_player_id='88888888-8888-4888-8888-888888888881' from public.alpha_invites where email='invited@alpha.test'),'signup consumes the invite');
select is(public.is_alpha_email_approved('invited@alpha.test'),false,'consumed invite is no longer approved');
delete from auth.users where id='88888888-8888-4888-8888-888888888881';
select throws_like($$insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)values('00000000-0000-0000-0000-000000000000','88888888-8888-4888-8888-888888888882','authenticated','authenticated','invited@alpha.test',crypt('password',gen_salt('bf')),now(),'{}','{"username":"InviteReuse"}',now(),now(),'','','','')$$,'%ALPHA_INVITE_REQUIRED%','consumed invite cannot be reused');

select * from finish();
rollback;
