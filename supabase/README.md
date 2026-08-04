# Supabase 스키마

Supabase 콘솔 → SQL Editor에 **번호 순서대로** 붙여넣고 Run.

| 파일 | 내용 |
|---|---|
| `0001_init.sql` | 테이블·RLS·트리거 전체 |
| `0002_owner_access.sql` | `is_trip_member()`가 소유자도 멤버로 인식하게 수정 |
| `0003_owner_id_server_side.sql` | `trips.owner_id`를 서버에서 강제 + `whoami()` 진단 함수 |
| `0004_trips_insert_orderfree.sql` | `trips` INSERT 정책을 평가 순서에 의존하지 않게 |
| `0005_packing.sql` | 준비물 체크리스트 (`packing_items`) |

전부 `create or replace` / `drop ... if exists`로 쓰여 있어 **여러 번 실행해도 안전**하다.

## 0002~0004는 왜 따로 있나

`0001`을 실제 DB에 돌려보지 않은 상태로 작성했고, 붙이는 과정에서 세 가지가 드러났다.
기록으로 남겨둔다 — 나중에 스키마를 손볼 때 같은 함정에 다시 빠지지 않기 위해서다.

**1. 소유자가 자기 여행에서 잠긴다 (0002)**

`is_trip_member()`가 `trip_members` 행만 봤다. 그런데 owner 멤버십은 `trips`의
`AFTER INSERT` 트리거가 붙이므로, 여행을 만드는 그 문장이 평가될 때는 아직 없다.
→ 멤버십 행이 없어도 `trips.owner_id`가 나면 멤버로 본다.

**2. `owner_id`를 클라이언트가 채우면 틀릴 여지가 남는다 (0003)**

`with check (owner_id = auth.uid())`는 클라이언트가 올바른 값을 보낼 때만 통과한다.
→ `BEFORE INSERT` 트리거가 `auth.uid()`로 덮어써서 틀릴 수 없게 만들었다.

**3. upsert가 UPDATE 정책까지 끌어들인다 (0004) — 실제 원인**

`trips`는 INSERT와 UPDATE 정책이 **따로** 걸린 유일한 테이블이다
(자식 테이블은 `for all` 하나로 묶여 있다). PostgREST의 `upsert`는
`INSERT ... ON CONFLICT DO UPDATE`로 나가기 때문에, 새 행을 만들 때도 `trips`의
UPDATE 정책에 발목이 잡혀 `42501`이 났다.

→ 클라이언트에서 **새 여행은 `.insert()`** 로 넣도록 바꿨고(`db/remote.ts`의
`insertTrip`), INSERT 정책은 `to authenticated with check (true)`로 단순화했다.
소유권은 트리거가 보장하므로 보안은 그대로다.

**교훈**: INSERT와 UPDATE 정책이 분리된 테이블에는 `upsert`를 쓰지 말 것.
`for all` 하나로 묶인 테이블(destinations/places/days/items/legs)은 upsert가 안전하다.

## 새로 세팅할 때

0001 → 0004를 순서대로 돌리면 된다. 0001의 결함이 뒤 파일에서 덮이므로
합치지 않고 그대로 두었다 — 위의 함정 기록이 파일과 같이 남아 있는 게 낫다.

## 진단

```sql
-- 정책이 실제로 어떻게 깔렸는지. permissive 컬럼을 꼭 볼 것 —
-- RESTRICTIVE가 하나라도 섞이면 PERMISSIVE 정책 전부를 무력화한다.
select policyname, cmd, permissive, roles::text, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;
```

앱에서는 `/debug`의 **Supabase 인증** 섹션이 `whoami()`를 호출해
세션 사용자와 서버가 보는 `auth.uid()`가 일치하는지 보여준다.
불일치하거나 `null`이면 RLS가 아니라 인증 문제다.
