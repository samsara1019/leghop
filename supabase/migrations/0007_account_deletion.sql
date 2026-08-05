-- 회원 탈퇴 (계정 및 데이터 완전 삭제)
--
-- 개인정보보호법은 목적 달성 후 **지체 없는 파기**를 요구한다. 이메일로 요청받아
-- 손으로 처리하면 지연되고 누락된다. 앱에서 바로 지울 수 있어야 한다.
--
-- 클라이언트는 auth.users를 지울 권한이 없다(서비스 키가 필요하다). 그래서
-- security definer 함수로 감싸고, 자기 자신만 지울 수 있게 auth.uid()로 고정한다.
--
-- 실행: Supabase 콘솔 > SQL Editor에 붙여넣고 Run. 여러 번 돌려도 안전하다.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select email into v_email from public.profiles where id = v_uid;

  -- 1) 내가 소유한 여행의 서류 파일.
  --    DB의 on delete cascade는 Storage 객체를 건드리지 않는다. 먼저 지우지 않으면
  --    주인 없는 파일이 남는다 — 여권 사본이 들어 있을 수 있는 파일들이다.
  delete from storage.objects
  where bucket_id = 'documents'
    and public.storage_trip_id(name) in (
      select id from public.trips where owner_id = v_uid
    );

  -- 2) 내가 소유한 여행.
  --    destinations/places/days/items/legs/packing_items/documents/trip_members가
  --    cascade로 함께 지워진다. 공유받은 사람도 접근을 잃는다 — 소유자의 데이터다.
  delete from public.trips where owner_id = v_uid;

  -- 3) 남의 여행에 참여 중이던 것은 **내 멤버십만** 뺀다. 그 여행 자체는 남는다.
  delete from public.trip_members where user_id = v_uid;

  -- 4) 내 이메일로 와 있던 대기 중 초대
  if v_email is not null then
    delete from public.trip_invites where lower(email) = lower(v_email);
  end if;

  -- 5) 프로필과 계정
  delete from public.profiles where id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

-- 로그인한 사용자만 호출할 수 있다. 함수 안에서 auth.uid()로 대상을 고정하므로
-- 남의 계정을 지정할 방법이 없다.
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
