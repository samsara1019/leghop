-- Leghop 초기 스키마
-- 서버가 정본, 클라이언트 IndexedDB는 읽기 전용 미러 (DESIGN.md §5)
--
-- 실행: Supabase 콘솔 > SQL Editor에 이 파일을 그대로 붙여넣고 Run.

-- ---------------------------------------------------------------------------
-- profiles : auth.users의 공개 가능한 부분만 미러
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text unique,
  display_name text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------

create table if not exists public.trips (
  id          uuid primary key,
  owner_id    uuid not null references auth.users on delete cascade,
  title       text not null,
  start_date  date not null,
  end_date    date not null,
  currency    text,
  -- 공유 인원 상한. 지금은 2명이지만 여행별로 올릴 수 있게 컬럼으로 둔다
  max_members int  not null default 2 check (max_members >= 1),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists trips_owner_idx on public.trips (owner_id);

-- ---------------------------------------------------------------------------
-- trip_members : 누가 이 여행을 볼/고칠 수 있는가
-- role은 지금 'editor'만 쓰지만, 나중에 보기 전용을 붙일 때
-- 마이그레이션이 필요 없도록 처음부터 열을 둔다.
-- ---------------------------------------------------------------------------

create table if not exists public.trip_members (
  trip_id    uuid not null references public.trips on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  role       text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  invited_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index if not exists trip_members_user_idx on public.trip_members (user_id);

-- ---------------------------------------------------------------------------
-- 여행에 딸린 것들
-- trip_id를 days/items/legs에도 비정규화해서 넣는다. RLS 정책과 동기화 쿼리가
-- 단순해지고(한 여행을 한 번에 긁어옴), 조인 없이 권한을 판정할 수 있다.
-- ---------------------------------------------------------------------------

create table if not exists public.destinations (
  id           uuid primary key,
  trip_id      uuid not null references public.trips on delete cascade,
  name         text not null,
  lat          double precision not null,
  lng          double precision not null,
  start_date   date not null,
  sort_order   int  not null default 0,
  country_code text,
  timezone     text
);

create index if not exists destinations_trip_idx on public.destinations (trip_id);

create table if not exists public.places (
  id              uuid primary key,
  trip_id         uuid not null references public.trips on delete cascade,
  destination_id  uuid references public.destinations on delete set null,
  google_place_id text,
  name            text not null,
  name_local      text,
  category        text not null,
  lat             double precision not null,
  lng             double precision not null,
  address         text not null default '',
  note            text,
  opening_hours   text[],
  price_level     text,
  tags            text[] not null default '{}',
  snapshot_at     timestamptz not null default now()
);

create index if not exists places_trip_idx on public.places (trip_id);

create table if not exists public.days (
  id         uuid primary key,
  trip_id    uuid not null references public.trips on delete cascade,
  date       date not null,
  sort_order int  not null default 0,
  unique (trip_id, date)
);

create index if not exists days_trip_idx on public.days (trip_id);

create table if not exists public.items (
  id           uuid primary key,
  trip_id      uuid not null references public.trips on delete cascade,
  day_id       uuid not null references public.days on delete cascade,
  sort_order   int  not null default 0,
  kind         text not null check (kind in ('stop', 'activity')),
  place_id     uuid references public.places on delete cascade,
  title        text,
  start_at     text,
  duration_min int  not null default 60,
  note         text
);

create index if not exists items_day_idx on public.items (day_id);
create index if not exists items_trip_idx on public.items (trip_id);

create table if not exists public.legs (
  id            uuid primary key,
  trip_id       uuid not null references public.trips on delete cascade,
  day_id        uuid not null references public.days on delete cascade,
  from_item_id  uuid not null references public.items on delete cascade,
  to_item_id    uuid not null references public.items on delete cascade,
  selected_mode text not null default 'transit',
  -- Directions 결과. 30일 캐시 상한이 있어 영구 보관 대상이 아니다 (DESIGN.md §7.1)
  alternatives  jsonb not null default '[]'::jsonb,
  computed_at   timestamptz,
  stale_reason  text,
  unique (day_id, from_item_id, to_item_id)
);

create index if not exists legs_day_idx on public.legs (day_id);
create index if not exists legs_trip_idx on public.legs (trip_id);

-- ---------------------------------------------------------------------------
-- trip_invites : 아직 가입하지 않은 사람도 초대할 수 있게
-- 가입 시점에 이메일이 맞는 초대를 자동으로 멤버십으로 바꾼다.
-- ---------------------------------------------------------------------------

create table if not exists public.trip_invites (
  trip_id    uuid not null references public.trips on delete cascade,
  email      text not null,
  role       text not null default 'editor' check (role in ('editor', 'viewer')),
  invited_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trip_id, email)
);

create index if not exists trip_invites_email_idx on public.trip_invites (lower(email));

-- ---------------------------------------------------------------------------
-- 권한 판정 함수
--
-- RLS 정책에서 trips ↔ trip_members를 서로 참조하면 정책이 무한 재귀한다.
-- security definer 함수는 RLS를 우회하므로 이 고리를 끊는다.
-- search_path를 고정하는 것은 security definer 함수의 필수 수칙이다.
-- ---------------------------------------------------------------------------

create or replace function public.is_trip_member(p_trip uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_owner(p_trip uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip and t.owner_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 트리거
-- ---------------------------------------------------------------------------

-- 가입하면 프로필을 만들고, 이메일로 와 있던 초대를 멤버십으로 바꾼다
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(excluded.display_name, profiles.display_name),
        avatar_url   = coalesce(excluded.avatar_url, profiles.avatar_url);

  insert into public.trip_members (trip_id, user_id, role, invited_by)
  select i.trip_id, new.id, i.role, i.invited_by
  from public.trip_invites i
  where lower(i.email) = lower(new.email)
  on conflict (trip_id, user_id) do nothing;

  delete from public.trip_invites where lower(email) = lower(new.email);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 여행을 만들면 만든 사람을 owner 멤버로 넣는다.
-- 클라이언트가 두 번 쓰게 하면 중간에 실패했을 때 접근 불가한 여행이 남는다.
create or replace function public.add_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (trip_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_trip_created on public.trips;
create trigger on_trip_created
  after insert on public.trips
  for each row execute function public.add_owner_as_member();

-- 공유 인원 상한. 상한은 trips.max_members라서 SQL 수정 없이 올릴 수 있다.
create or replace function public.enforce_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_max   int;
begin
  select count(*) into v_count from public.trip_members where trip_id = new.trip_id;
  select max_members into v_max from public.trips where id = new.trip_id;

  if v_count >= coalesce(v_max, 2) then
    raise exception 'member_limit_reached: 이 여행은 최대 %명까지 참여할 수 있습니다', v_max
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trip_members_limit on public.trip_members;
create trigger trip_members_limit
  before insert on public.trip_members
  for each row execute function public.enforce_member_limit();

-- 초대도 같은 상한을 넘지 않게 (멤버 + 대기 중 초대 합산)
create or replace function public.enforce_invite_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_max   int;
begin
  select (select count(*) from public.trip_members where trip_id = new.trip_id)
       + (select count(*) from public.trip_invites where trip_id = new.trip_id)
    into v_total;
  select max_members into v_max from public.trips where id = new.trip_id;

  if v_total >= coalesce(v_max, 2) then
    raise exception 'member_limit_reached: 이 여행은 최대 %명까지 참여할 수 있습니다', v_max
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trip_invites_limit on public.trip_invites;
create trigger trip_invites_limit
  before insert on public.trip_invites
  for each row execute function public.enforce_invite_limit();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trips_touch on public.trips;
create trigger trips_touch
  before update on public.trips
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 초대 RPC
--
-- 이메일로 사람을 찾는 걸 클라이언트에 열어주면 계정 존재 여부를 캐낼 수 있다.
-- 그래서 profiles는 자기 것만 읽게 막고, 초대는 이 함수로만 하게 한다.
-- ---------------------------------------------------------------------------

create or replace function public.invite_to_trip(p_trip uuid, p_email text, p_role text default 'editor')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid;
  v_email text := lower(trim(p_email));
begin
  if not public.is_trip_owner(p_trip) then
    raise exception 'not_owner: 소유자만 초대할 수 있습니다';
  end if;
  if v_email is null or v_email = '' then
    raise exception 'invalid_email';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'invalid_role';
  end if;

  select id into v_uid from public.profiles where lower(email) = v_email;

  if v_uid is not null then
    if exists (select 1 from public.trip_members where trip_id = p_trip and user_id = v_uid) then
      return 'already_member';
    end if;
    insert into public.trip_members (trip_id, user_id, role, invited_by)
    values (p_trip, v_uid, p_role, auth.uid());
    return 'added';
  end if;

  -- 아직 가입하지 않은 사람 — 가입 시 트리거가 멤버십으로 바꿔준다
  insert into public.trip_invites (trip_id, email, role, invited_by)
  values (p_trip, v_email, p_role, auth.uid())
  on conflict (trip_id, email) do update set role = excluded.role;
  return 'invited';
end;
$$;

-- 멤버 목록은 이메일이 필요해서 조인이 불가피하다. 멤버만 볼 수 있게 함수로 감싼다.
create or replace function public.trip_member_list(p_trip uuid)
returns table (user_id uuid, email text, display_name text, avatar_url text, role text, is_pending boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trip_member(p_trip) then
    raise exception 'not_member';
  end if;

  return query
    select m.user_id, p.email, p.display_name, p.avatar_url, m.role, false
    from public.trip_members m
    join public.profiles p on p.id = m.user_id
    where m.trip_id = p_trip
    union all
    select null::uuid, i.email, null, null, i.role, true
    from public.trip_invites i
    where i.trip_id = p_trip;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.trips         enable row level security;
alter table public.trip_members  enable row level security;
alter table public.trip_invites  enable row level security;
alter table public.destinations  enable row level security;
alter table public.places        enable row level security;
alter table public.days          enable row level security;
alter table public.items         enable row level security;
alter table public.legs          enable row level security;

-- profiles: 자기 것만. 남의 프로필을 이메일로 훑을 수 없게 한다.
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid());

-- trips
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips
  for select using (public.is_trip_member(id));

drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips
  for insert with check (owner_id = auth.uid());

drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips
  for update using (public.is_trip_member(id));

-- 삭제는 소유자만. 공유받은 사람이 남의 여행을 날릴 수는 없다.
drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips
  for delete using (owner_id = auth.uid());

-- trip_members
drop policy if exists members_select on public.trip_members;
create policy members_select on public.trip_members
  for select using (public.is_trip_member(trip_id));

drop policy if exists members_insert on public.trip_members;
create policy members_insert on public.trip_members
  for insert with check (public.is_trip_owner(trip_id));

-- 소유자는 내보낼 수 있고, 본인은 스스로 나갈 수 있다
drop policy if exists members_delete on public.trip_members;
create policy members_delete on public.trip_members
  for delete using (public.is_trip_owner(trip_id) or user_id = auth.uid());

-- trip_invites: 소유자만 다룬다
drop policy if exists invites_all on public.trip_invites;
create policy invites_all on public.trip_invites
  for all using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id));

-- 여행에 딸린 테이블은 전부 같은 규칙 — 멤버면 읽고 쓴다
do $$
declare t text;
begin
  for t in select unnest(array['destinations', 'places', 'days', 'items', 'legs'])
  loop
    execute format('drop policy if exists %I on public.%I', t || '_member_all', t);
    execute format(
      'create policy %I on public.%I for all
         using (public.is_trip_member(trip_id))
         with check (public.is_trip_member(trip_id))', t || '_member_all', t);
  end loop;
end $$;
