-- trips INSERT 42501 최종 해결: 평가 순서에 의존하지 않게 만든다
--
-- 0003은 BEFORE INSERT 트리거로 owner_id를 auth.uid()로 덮고, 정책은
-- `with check (owner_id = auth.uid())`로 뒀다. 이 조합은 "트리거가 먼저 돌고
-- 그 다음 WITH CHECK가 평가된다"는 전제에 기대고 있다.
--
-- 그 전제를 없앤다:
--   · 정책은 "로그인한 사용자인가"만 본다 → with check (true) + to authenticated
--   · 소유권은 트리거가 보장한다 → 클라이언트가 owner_id를 뭘 보내든 auth.uid()로 덮인다
--
-- 보안이 약해지지 않는다. authenticated 역할은 auth.uid()가 항상 있고,
-- 트리거가 그 값으로 강제하므로 남의 소유로 만들 방법이 없다.
-- anon은 `to authenticated` 때문에 애초에 INSERT가 막힌다.
--
-- 실행: Supabase 콘솔 > SQL Editor에 붙여넣고 Run.

-- ---------------------------------------------------------------------------
-- 1. 소유권 강제 트리거 (재생성 — 0003에서 안 붙었을 수도 있다)
-- ---------------------------------------------------------------------------

create or replace function public.force_trip_owner()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.owner_id := coalesce(auth.uid(), new.owner_id);
  if new.owner_id is null then
    raise exception 'owner_required: 로그인 상태가 아닙니다';
  end if;
  return new;
end;
$$;

drop trigger if exists trips_force_owner on public.trips;
create trigger trips_force_owner
  before insert on public.trips
  for each row execute function public.force_trip_owner();

-- ---------------------------------------------------------------------------
-- 2. INSERT 정책은 로그인 여부만 본다
-- ---------------------------------------------------------------------------

alter table public.trips enable row level security;

drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips
  for insert
  to authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- 3. 지금 상태를 출력한다. 그래도 실패하면 이 결과를 그대로 붙여주면 된다.
-- ---------------------------------------------------------------------------

select 'policy' as kind, policyname as name, cmd::text as detail, roles::text as extra,
       coalesce(with_check, '(none)') as expr
from pg_policies
where schemaname = 'public' and tablename = 'trips'

union all
select 'trigger', tgname, case tgenabled when 'O' then 'enabled' else tgenabled::text end,
       '', ''
from pg_trigger
where tgrelid = 'public.trips'::regclass and not tgisinternal

union all
select 'column-default', column_name, coalesce(column_default, '(none)'), '', ''
from information_schema.columns
where table_schema = 'public' and table_name = 'trips' and column_name = 'owner_id'

union all
select 'rls-enabled', relname, relrowsecurity::text, '', ''
from pg_class
where oid = 'public.trips'::regclass

order by kind, name;
