-- Make invite consumption single-use and expose a minimal preflight for the
-- unauthenticated signup form. The trigger remains the authoritative gate.

create or replace function public.is_alpha_email_approved(requested_email text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select lower(trim(coalesce(requested_email,''))) like '%@example.test'
    or exists(
      select 1
      from public.alpha_invites
      where email=lower(trim(coalesce(requested_email,'')))
        and active
        and registered_player_id is null
    );
$$;

create or replace function public.handle_new_player() returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  safe_username text;
  normalized_email text:=lower(coalesce(new.email,''));
  test_account boolean:=normalized_email like '%@example.test';
begin
  if not test_account then
    perform 1
    from public.alpha_invites
    where email=normalized_email
      and active
      and registered_player_id is null
    for update;
    if not found then raise exception 'ALPHA_INVITE_REQUIRED'; end if;
  end if;

  safe_username:=coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''),split_part(new.email,'@',1),'Founder');
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

  if not test_account then
    update public.alpha_invites
    set registered_player_id=new.id,registered_at=now(),active=false
    where email=normalized_email
      and active
      and registered_player_id is null;
    if not found then raise exception 'ALPHA_INVITE_REQUIRED'; end if;
  end if;

  insert into public.alpha_cohort_events(player_id,event_type,metadata)
  values(new.id,'REGISTERED',jsonb_build_object('email',normalized_email))
  on conflict(player_id,event_type) do nothing;
  return new;
end $$;

revoke all on function public.is_alpha_email_approved(text) from public;
grant execute on function public.is_alpha_email_approved(text) to anon,authenticated;
