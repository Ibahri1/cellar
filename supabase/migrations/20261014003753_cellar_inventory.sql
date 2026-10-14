-- One private cellar. Run on a dedicated Supabase project after review.
create schema if not exists private;
revoke all on schema private from public;
create role cellar_writer nologin noinherit;
create role cellar_login nologin noinherit;
grant usage on schema public, private, auth to cellar_writer;
grant usage on schema private to authenticated, cellar_login;

create table private.admin_access (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id)
);
alter table private.admin_access enable row level security;
-- No client policies: only project administrators can configure this identity.
create table private.authorized_sessions (
  id uuid primary key references auth.sessions(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.authorized_sessions enable row level security;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists (select 1 from private.admin_access a where a.user_id = auth.uid())
    and exists (select 1 from private.authorized_sessions a where a.id = nullif(auth.jwt()->>'session_id','')::uuid)
    and exists (select 1 from auth.sessions s
      where s.user_id = auth.uid()
        and s.id = nullif(auth.jwt()->>'session_id','')::uuid
        and s.created_at > now() - interval '8 hours'
        and (s.not_after is null or s.not_after > now()));
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, cellar_writer;

create function private.session_deadline() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select least(s.created_at + interval '8 hours',s.not_after) from auth.sessions s
    where auth.uid() is not null and s.user_id = auth.uid()
      and s.id = nullif(auth.jwt()->>'session_id','')::uuid and private.is_admin();
$$;
revoke all on function private.session_deadline() from public, anon;
grant execute on function private.session_deadline() to authenticated;

-- Only the restricted Edge Function DB role can authorize a session after its
-- throttled password check. Direct Auth logins alone cannot access cellar data.
create function private.authorize_login(p_session_id uuid,p_user_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from private.admin_access a join auth.sessions s on s.user_id = a.user_id
    where a.user_id = p_user_id and s.id = p_session_id and s.created_at > now() - interval '8 hours') then
    return false;
  end if;
  delete from private.authorized_sessions where created_at < now() - interval '8 hours';
  insert into private.authorized_sessions(id) values(p_session_id) on conflict do nothing;
  return true;
end;
$$;
revoke all on function private.authorize_login(uuid,uuid) from public, anon, authenticated;
grant execute on function private.authorize_login(uuid,uuid) to cellar_login;

create table public.cellar_settings (
  id integer primary key default 1 check (id = 1),
  cellar_rows integer not null default 12 check (cellar_rows = 12),
  cellar_columns integer not null default 5 check (cellar_columns = 5),
  cellar_depth integer not null default 3 check (cellar_depth = 3),
  preferences jsonb not null default '{}'::jsonb
);
insert into public.cellar_settings(id) values (1);

create table public.wines (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  producer text not null default '' check (length(producer) <= 200),
  vintage integer check (vintage between 1 and 9999),
  wine_type text not null check (wine_type in ('Red','White','Rosé','Sparkling','Dessert','Fortified','Other')),
  country text not null default '' check (length(country) <= 160),
  region text not null default '' check (length(region) <= 160),
  grape_variety text not null default '' check (length(grape_variety) <= 200),
  bottle_size integer not null default 750 check (bottle_size between 50 and 18000),
  tasting_notes text not null default '' check (length(tasting_notes) <= 10000),
  image_url text check (image_url is null or (length(image_url) <= 2048 and image_url ~ '^https://')),
  drinking_window_start integer check (drinking_window_start between 1 and 9999),
  drinking_window_end integer check (drinking_window_end between 1 and 9999),
  created_at timestamptz not null default now(),
  check (drinking_window_start is null or drinking_window_end is null or drinking_window_start <= drinking_window_end)
);
create table public.bottles (
  id uuid primary key default gen_random_uuid(),
  wine_id uuid not null references public.wines(id),
  location_type text not null check (location_type in ('RACK','BOTTOM')),
  row_number integer,
  column_number integer,
  depth_number integer,
  status text not null default 'In Cellar' check (status in ('In Cellar','Drank','Gifted')),
  personal_rating integer check (personal_rating between 1 and 5),
  personal_notes text not null default '' check (length(personal_notes) <= 10000),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  check ((location_type = 'RACK' and row_number is not null and column_number is not null and depth_number is not null
          and row_number between 1 and 12 and column_number between 1 and 5 and depth_number between 1 and 3)
      or (location_type = 'BOTTOM' and row_number is null and column_number is null and depth_number is null)),
  check ((status = 'In Cellar' and removed_at is null) or (status in ('Drank','Gifted') and removed_at is not null))
);
create unique index bottles_active_rack_position on public.bottles(row_number,column_number,depth_number)
  where status = 'In Cellar' and location_type = 'RACK';
create index bottles_wine_id on public.bottles(wine_id);

create table public.activity_history (
  id uuid primary key default gen_random_uuid(),
  bottle_id uuid not null references public.bottles(id),
  action text not null check (action in ('Added','Edited','Moved','Drank','Gifted')),
  wine_name text not null,
  vintage integer,
  previous_location text,
  new_location text,
  created_at timestamptz not null default now()
);
create index activity_history_created_at on public.activity_history(created_at desc);
create index activity_history_bottle_id on public.activity_history(bottle_id);

create table private.mutation_requests (
  id uuid primary key,
  request_hash text not null,
  result jsonb not null default '[]'::jsonb
);
alter table private.mutation_requests enable row level security;
create policy writer_requests on private.mutation_requests for all to cellar_writer
  using ((select private.is_admin())) with check ((select private.is_admin()));

alter table public.wines enable row level security;
alter table public.bottles enable row level security;
alter table public.activity_history enable row level security;
alter table public.cellar_settings enable row level security;
create policy admin_read on public.wines for select to authenticated, cellar_writer using ((select private.is_admin()));
create policy admin_read on public.bottles for select to authenticated, cellar_writer using ((select private.is_admin()));
create policy admin_read on public.activity_history for select to authenticated, cellar_writer using ((select private.is_admin()));
create policy admin_read on public.cellar_settings for select to authenticated, cellar_writer using ((select private.is_admin()));
create policy writer_insert on public.wines for insert to cellar_writer with check ((select private.is_admin()));
create policy writer_insert on public.bottles for insert to cellar_writer with check ((select private.is_admin()));
create policy writer_update on public.bottles for update to cellar_writer
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy writer_history on public.activity_history for insert to cellar_writer with check ((select private.is_admin()));
revoke all on public.wines, public.bottles, public.activity_history, public.cellar_settings from anon, authenticated;
grant select on public.wines, public.bottles, public.activity_history, public.cellar_settings to authenticated, cellar_writer;
grant insert on public.wines, public.bottles, public.activity_history to cellar_writer;
grant update on public.bottles to cellar_writer;
grant select, insert, update on private.mutation_requests to cellar_writer;

create function private.location_label(b public.bottles) returns text
language sql immutable set search_path = '' as $$
  select case when b.location_type = 'BOTTOM' then 'BOTTOM'
    else 'R' || b.row_number || '-C' || b.column_number || '-D' || b.depth_number end;
$$;
revoke all on function private.location_label(public.bottles) from public;
grant execute on function private.location_label(public.bottles) to cellar_writer;

-- Private definer runs as a dedicated NOLOGIN role with RLS enabled, NOT postgres
-- or service_role. Clients get SELECT only; writes cannot skip activity history.
create function private.mutate_cellar(p_action text, p_payload jsonb, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_bottle public.bottles;
  v_new public.bottles;
  v_wine public.wines;
  v_location jsonb;
  v_data jsonb;
  v_before text;
  v_ids jsonb := '[]'::jsonb;
  v_hash text := md5(p_action || p_payload::text);
  v_request private.mutation_requests;
  v_claimed integer;
begin
  if not private.is_admin() then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_action not in ('add','edit','move','Drank','Gifted') or p_request_id is null or p_payload is null then
    raise exception 'INVALID_OPERATION' using errcode = '22023';
  end if;
  insert into private.mutation_requests(id,request_hash) values(p_request_id,v_hash) on conflict do nothing;
  get diagnostics v_claimed = row_count;
  if v_claimed = 0 then
    select * into v_request from private.mutation_requests where id = p_request_id;
    if v_request.request_hash <> v_hash then raise exception 'REQUEST_REUSED' using errcode = '22023'; end if;
    return v_request.result;
  end if;

  if p_action <> 'add' then
    select * into v_bottle from public.bottles where id = (p_payload->>'id')::uuid for update;
    if not found then raise exception 'BOTTLE_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_bottle.version <> (p_payload->>'version')::bigint or p_payload->>'version' is null then
      raise exception 'EDIT_CONFLICT' using errcode = '40001';
    end if;
    if v_bottle.status <> 'In Cellar' and p_action <> 'edit' then raise exception 'BOTTLE_REMOVED' using errcode = '22023'; end if;
    v_before := private.location_label(v_bottle);
  end if;

  if p_action in ('add','edit') then
    if p_payload->>'wine_id' is not null and p_action = 'add' then
      select * into v_wine from public.wines where id = (p_payload->>'wine_id')::uuid;
      if not found then raise exception 'INVALID_WINE' using errcode = '22023'; end if;
    else
      v_data := p_payload->'wine';
      if v_data is null then raise exception 'INVALID_WINE' using errcode = '22023'; end if;
      -- A new immutable wine revision on edit preserves other bottles and past history.
      insert into public.wines(name,producer,vintage,wine_type,country,region,grape_variety,bottle_size,tasting_notes,image_url,drinking_window_start,drinking_window_end)
      values(trim(v_data->>'name'),coalesce(v_data->>'producer',''),nullif(v_data->>'vintage','')::integer,v_data->>'wine_type',
        coalesce(v_data->>'country',''),coalesce(v_data->>'region',''),coalesce(v_data->>'grape_variety',''),
        coalesce((v_data->>'bottle_size')::integer,750),coalesce(v_data->>'tasting_notes',''),nullif(v_data->>'image_url',''),
        nullif(v_data->>'drinking_window_start','')::integer,nullif(v_data->>'drinking_window_end','')::integer)
      returning * into v_wine;
    end if;
  else
    select * into v_wine from public.wines where id = v_bottle.wine_id;
  end if;

  if p_action = 'add' then
    if jsonb_typeof(p_payload->'placements') <> 'array' or p_payload->'placements' is null
      or jsonb_array_length(p_payload->'placements') < 1 then raise exception 'INVALID_PLACEMENTS' using errcode = '22023'; end if;
    for v_location in select value from jsonb_array_elements(p_payload->'placements') loop
      insert into public.bottles(wine_id,location_type,row_number,column_number,depth_number,personal_notes,personal_rating)
      values(v_wine.id,v_location->>'location_type',(v_location->>'row_number')::integer,
        (v_location->>'column_number')::integer,(v_location->>'depth_number')::integer,
        coalesce(p_payload->>'personal_notes',''),(p_payload->>'personal_rating')::integer) returning * into v_new;
      insert into public.activity_history(bottle_id,action,wine_name,vintage,new_location)
      values(v_new.id,'Added',v_wine.name,v_wine.vintage,private.location_label(v_new));
      v_ids := v_ids || jsonb_build_array(v_new.id);
    end loop;
  else
    if p_action = 'move' then
      v_location := p_payload->'location';
      update public.bottles set location_type = v_location->>'location_type',
        row_number = (v_location->>'row_number')::integer,column_number = (v_location->>'column_number')::integer,
        depth_number = (v_location->>'depth_number')::integer,version = version + 1 where id = v_bottle.id returning * into v_new;
    elsif p_action = 'edit' then
      update public.bottles set wine_id = v_wine.id,personal_notes = coalesce(p_payload->>'personal_notes',''),
        personal_rating = (p_payload->>'personal_rating')::integer,version = version + 1 where id = v_bottle.id returning * into v_new;
    else
      update public.bottles set status = p_action,removed_at = now(),version = version + 1
        where id = v_bottle.id returning * into v_new;
    end if;
    insert into public.activity_history(bottle_id,action,wine_name,vintage,previous_location,new_location)
    values(v_new.id,case p_action when 'edit' then 'Edited' when 'move' then 'Moved' else p_action end,
      v_wine.name,v_wine.vintage,case when v_bottle.status = 'In Cellar' then v_before end,
      case when v_new.status = 'In Cellar' then private.location_label(v_new) end);
    v_ids := jsonb_build_array(v_new.id);
  end if;
  update private.mutation_requests set result = v_ids where id = p_request_id;
  return v_ids;
end;
$$;
grant create on schema private to cellar_writer;
alter function private.mutate_cellar(text,jsonb,uuid) owner to cellar_writer;
revoke create on schema private from cellar_writer;
revoke all on function private.mutate_cellar(text,jsonb,uuid) from public, anon;
grant execute on function private.mutate_cellar(text,jsonb,uuid) to authenticated;

create function public.mutate_cellar(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.mutate_cellar(p_action,p_payload,p_request_id);
$$;
revoke all on function public.mutate_cellar(text,jsonb,uuid) from public, anon;
grant execute on function public.mutate_cellar(text,jsonb,uuid) to authenticated;
create function public.cellar_session_valid() returns boolean
language sql stable security invoker set search_path = '' as $$ select private.is_admin(); $$;
revoke all on function public.cellar_session_valid() from public, anon;
grant execute on function public.cellar_session_valid() to authenticated;

-- One consistent snapshot avoids PostgREST's default row limit and mixed reads
-- across transactions. Historical bottles remain available for count statistics.
create function public.cellar_snapshot() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return jsonb_build_object(
    'bottles',coalesce((select jsonb_agg(to_jsonb(b) || jsonb_build_object('wine',to_jsonb(w)))
      from public.bottles b join public.wines w on w.id = b.wine_id),'[]'::jsonb),
    'settings',(select to_jsonb(s) from public.cellar_settings s where id = 1),
    'session_expires_at',private.session_deadline());
end;
$$;
revoke all on function public.cellar_snapshot() from public, anon;
grant execute on function public.cellar_snapshot() to authenticated;

-- Global login throttle, accessible only over a restricted server DB connection.
-- A fixed single row avoids unbounded attacker-controlled IP keys/storage.
create table private.login_throttle (
  id boolean primary key default true check (id),
  window_start timestamptz not null,
  attempts integer not null
);
alter table private.login_throttle enable row level security;
create policy login_only on private.login_throttle for all to cellar_login using (true) with check (true);
grant select,insert,update on private.login_throttle to cellar_login;
create function private.consume_login_attempt() returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_attempts integer;
begin
  insert into private.login_throttle(id,window_start,attempts) values(true,clock_timestamp(),1)
  on conflict (id) do update set
    attempts = case when private.login_throttle.window_start < clock_timestamp() - interval '15 minutes' then 1 else private.login_throttle.attempts + 1 end,
    window_start = case when private.login_throttle.window_start < clock_timestamp() - interval '15 minutes' then clock_timestamp() else private.login_throttle.window_start end
  returning attempts into v_attempts;
  return v_attempts <= 10;
end;
$$;
revoke all on function private.consume_login_attempt() from public, anon, authenticated;
grant execute on function private.consume_login_attempt() to cellar_login;

-- One subscription listens only to the shared cellar's transactional history.
-- Every mutation inserts history, so it also invalidates inventory/statistics.
alter publication supabase_realtime add table public.activity_history;
