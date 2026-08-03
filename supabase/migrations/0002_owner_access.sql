-- 0001의 결함 수정
--
-- 문제: is_trip_member()가 trip_members 행만 본다. 그런데 owner 멤버십은
-- trips에 대한 AFTER INSERT 트리거가 붙이므로, 여행을 만드는 그 문장이
-- 평가될 때는 아직 존재하지 않는다. 그래서 소유자가 방금 만든 자기 여행에
-- 접근하지 못하고 막힌다.
--
-- 해결: 멤버십 행이 없어도 trips.owner_id가 나면 멤버로 본다.
-- 소유자 판정은 trips 한 줄로 끝나므로 트리거 타이밍에 의존하지 않는다.
--
-- 실행: Supabase 콘솔 > SQL Editor에 붙여넣고 Run. 여러 번 돌려도 안전하다.

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
  )
  -- 멤버십 행이 아직/영영 없어도 소유자는 항상 접근 가능해야 한다
  or exists (
    select 1 from public.trips t
    where t.id = p_trip and t.owner_id = auth.uid()
  );
$$;

-- UPDATE 정책에 with check를 명시한다.
-- 없으면 using 식이 새 행 검사에도 재사용되는데, upsert(INSERT ... ON CONFLICT
-- DO UPDATE) 경로에서 어떤 식이 적용되는지가 헷갈린다. 명시가 낫다.
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips
  for update
  using (public.is_trip_member(id))
  with check (public.is_trip_member(id));

-- ---------------------------------------------------------------------------
-- 진단용 — 지금 정책이 실제로 어떻게 깔렸는지 확인한다
-- ---------------------------------------------------------------------------

-- 1) RLS가 켜져 있고 정책이 다 있는지
--
-- select tablename, policyname, cmd
-- from pg_policies
-- where schemaname = 'public'
-- order by tablename, policyname;

-- 2) 테이블별 RLS 활성 여부
--
-- select relname, relrowsecurity
-- from pg_class
-- where relnamespace = 'public'::regnamespace
--   and relname in ('trips','trip_members','destinations','places','days','items','legs')
-- order by relname;
