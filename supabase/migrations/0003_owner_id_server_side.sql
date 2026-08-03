-- trips INSERT가 42501로 막히는 문제 해결
--
-- "new row violates row-level security policy" 는 두 경우에 똑같이 나온다:
--   (a) trips_insert 정책이 있는데 owner_id = auth.uid() 가 거짓
--   (b) INSERT를 허용하는 정책이 아예 없다 (0001이 끝까지 안 돌았거나 이름이 다름)
--
-- 그래서 양쪽을 다 막는다:
--   1. owner_id를 **서버에서** 채운다. 클라이언트가 뭘 보내든 auth.uid()로 고정되므로
--      (a)가 구조적으로 불가능해진다.
--   2. trips 정책 4개를 이름까지 못박아 다시 만든다 → (b) 해소.
--
-- 실행: Supabase 콘솔 > SQL Editor에 붙여넣고 Run. 여러 번 돌려도 안전하다.

-- ---------------------------------------------------------------------------
-- 1. owner_id는 서버가 정한다
-- ---------------------------------------------------------------------------

alter table public.trips
  alter column owner_id set default auth.uid();

-- 클라이언트가 owner_id를 빼먹거나 남의 id를 보내도 자기 것으로 강제한다.
-- 정책에만 의존하면 "왜 403인지" 디버깅에 시간이 든다 — 애초에 틀릴 수 없게 만든다.
create or replace function public.force_trip_owner()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.owner_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trips_force_owner on public.trips;
create trigger trips_force_owner
  before insert on public.trips
  for each row execute function public.force_trip_owner();

-- ---------------------------------------------------------------------------
-- 2. trips 정책을 확실히 다시 만든다
-- ---------------------------------------------------------------------------

alter table public.trips enable row level security;

drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips
  for select
  to authenticated
  using (public.is_trip_member(id));

drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips
  for insert
  to authenticated
  -- 트리거가 이미 auth.uid()로 덮었으므로 이 검사는 사실상 항상 통과한다.
  -- 그래도 남겨둔다 — 트리거가 사라지면 정책이 마지막 방어선이다.
  with check (owner_id = auth.uid());

drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips
  for update
  to authenticated
  using (public.is_trip_member(id))
  with check (public.is_trip_member(id));

drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips
  for delete
  to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. 진단: 지금 로그인한 사람이 서버에서 누구로 보이는지
--
-- 클라이언트에서 supabase.rpc('whoami')로 부르면 서버가 보는 auth.uid()가 나온다.
-- 이 값이 null이면 요청에 JWT가 안 실린 것이고, 세션의 user.id와 다르면
-- 다른 계정으로 붙은 것이다. 둘 다 정책 문제가 아니라 인증 문제다.
-- ---------------------------------------------------------------------------

create or replace function public.whoami()
returns table (uid uuid, role text, email text)
language sql
security invoker
stable
set search_path = public
as $$
  select
    auth.uid(),
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    current_setting('request.jwt.claims', true)::jsonb ->> 'email';
$$;
