-- 여행 준비물 체크리스트
--
-- 여행 단위로 공유한다. 둘이 같이 준비하면 누가 뭘 챙겼는지 서로 보여야
-- 체크리스트가 의미가 있다. (사람별로 나누려면 user_id 컬럼을 추가하면 되지만,
-- 지금은 "여권 2개"처럼 항목 이름으로 구분하는 편이 단순하다)
--
-- 실행: Supabase 콘솔 > SQL Editor에 붙여넣고 Run. 여러 번 돌려도 안전하다.

create table if not exists public.packing_items (
  id         uuid primary key,
  trip_id    uuid not null references public.trips on delete cascade,
  category   text not null,
  name       text not null,
  note       text,
  checked    boolean not null default false,
  sort_order int  not null default 0,
  -- template = 템플릿에서 만들어진 항목, custom = 사용자가 직접 추가.
  -- 템플릿을 다시 생성할 때 custom 항목을 지우지 않기 위해 구분한다.
  source     text not null default 'template' check (source in ('template', 'custom')),
  created_at timestamptz not null default now()
);

create index if not exists packing_items_trip_idx on public.packing_items (trip_id);

-- 같은 여행에 같은 이름을 두 번 만들지 않는다. 템플릿 재생성이 멱등해진다.
create unique index if not exists packing_items_trip_name_uniq
  on public.packing_items (trip_id, name);

alter table public.packing_items enable row level security;

-- 여행 멤버면 읽고 쓴다 — 다른 자식 테이블과 같은 규칙
drop policy if exists packing_items_member_all on public.packing_items;
create policy packing_items_member_all on public.packing_items
  for all
  to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));
