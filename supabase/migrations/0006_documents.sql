-- 서류보관함 (바우처·항공권·예약 확인서 등)
--
-- 파일은 Supabase Storage의 **비공개 버킷**에 두고, 메타데이터만 테이블에 남긴다.
-- 클라이언트는 파일 바이트를 IndexedDB에 캐시해서 오프라인에서도 열 수 있게 한다
-- (여권·바우처는 데이터가 안 터지는 공항에서 정작 필요하다).
--
-- 경로 규칙: documents/{trip_id}/{document_id}
-- 첫 경로 조각이 trip_id라서 Storage 정책이 조인 없이 권한을 판정할 수 있다.
--
-- 실행: Supabase 콘솔 > SQL Editor에 붙여넣고 Run. 여러 번 돌려도 안전하다.

create table if not exists public.documents (
  id           uuid primary key,
  trip_id      uuid not null references public.trips on delete cascade,
  title        text not null,
  category     text not null default 'other'
                 check (category in ('voucher', 'ticket', 'lodging', 'insurance', 'id', 'other')),
  file_name    text not null,
  mime_type    text not null,
  size_bytes   bigint not null,
  /** documents 버킷 안의 경로. {trip_id}/{id} */
  storage_path text not null,
  note         text,
  uploaded_by  uuid references auth.users on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists documents_trip_idx on public.documents (trip_id);

alter table public.documents enable row level security;

drop policy if exists documents_member_all on public.documents;
create policy documents_member_all on public.documents
  for all
  to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

-- ---------------------------------------------------------------------------
-- Storage 버킷
--
-- public = false. 서류에는 여권 사본이나 예약자 정보가 들어간다 —
-- 링크만 알면 누구나 보는 상태가 되면 안 된다.
-- 접근은 항상 인증된 세션으로, 아래 정책을 통해서만 이뤄진다.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760)  -- 10MB
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760;

-- 경로 첫 조각(trip_id)으로 멤버 여부를 판정한다.
-- uuid 형태를 먼저 확인한다 — 그러지 않으면 엉뚱한 경로가 캐스팅 오류를 낸다.
create or replace function public.storage_trip_id(object_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when (storage.foldername(object_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(object_name))[1])::uuid
    else null
  end;
$$;

drop policy if exists documents_storage_select on storage.objects;
create policy documents_storage_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'documents'
    and public.is_trip_member(public.storage_trip_id(name))
  );

drop policy if exists documents_storage_insert on storage.objects;
create policy documents_storage_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and public.is_trip_member(public.storage_trip_id(name))
  );

drop policy if exists documents_storage_update on storage.objects;
create policy documents_storage_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'documents'
    and public.is_trip_member(public.storage_trip_id(name))
  );

drop policy if exists documents_storage_delete on storage.objects;
create policy documents_storage_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and public.is_trip_member(public.storage_trip_id(name))
  );
