# 프로젝트 이슈트래커 MVP 플랜

## 1. 방향

이 기능은 WBS 기능 안에 끼워 넣는 부가 탭이 아니라, 같은 프로젝트를 공유하는 별도 업무공간으로 만든다.

```
프로젝트
  - WBS: 외부업체 협업, 계획, 일정, 진척 관리
  - 이슈: 내부 협업, 장애/요청 처리, 공수 로그, 정산 근거 관리
```

DB와 회원/프로젝트 권한은 공유하되, 접속 URL과 화면 레이아웃은 분리한다.

```
/projects/:projectId              기존 프로젝트 작업공간
/projects/:projectId/wbs          WBS 전용 진입점 또는 기존 기본 화면
/projects/:projectId/issues       이슈 전용 화면
/projects/:projectId/issues/:id   이슈 상세 화면
```

초기에는 별도 최상위 `/issues` 메뉴를 만들지 않는다. 프로젝트 안에서 시작하고, 전체 프로젝트 통합 이슈/정산 화면은 2차로 둔다.

## 2. MVP 목표

구글시트를 그대로 복제하는 것이 아니라, 현재 로그성 데이터를 분석 가능한 구조로 바꾼다.

1차 성공 기준:

- 프로젝트별 이슈를 등록하고 상태를 바꿀 수 있다.
- 이슈별 처리이력을 시간순으로 남길 수 있다.
- 이슈별 공수를 여러 건 입력할 수 있다.
- 월별/담당자별/업체별 공수 합계를 볼 수 있다.
- 기존 구글시트 데이터를 CSV로 가져올 수 있는 구조를 가진다.

특히 공수는 이슈의 메모가 아니라 지급 근거가 되는 별도 장부로 다룬다.

## 3. 1차 범위

### 포함

- 프로젝트 이슈 목록
- 이슈 생성/수정/삭제
- 상태 변경
- 처리이력 코멘트
- 공수 입력/수정/삭제
- 이슈 상세 패널 또는 상세 페이지
- 기본 필터: 상태, 담당자, 업체, 기간, 검색어
- 공수 요약: 월별, 담당자별, 업체별
- WBS 화면에서 이슈 화면으로 이동하는 링크
- 이슈에서 관련 WBS 작업을 선택 연결할 수 있는 필드

### 제외

- 복잡한 승인 워크플로우 자동화
- 이메일/텔레그램 알림
- 외부업체 전용 포털
- 전체 프로젝트 통합 이슈 대시보드
- 정산서 자동 발행
- 세밀한 모듈별 권한 UI

## 4. 상태 모델

MVP 상태는 단순하게 시작한다.

```
접수
검토
작업중
검수요청
완료
보류
```

기존 시트의 `사업-접수`, `개발-검토`, `개발-공수정산` 같은 상세 상태는 원본 CSV 가져오기 때 `legacy_status`로 보존할 수 있게 둔다. 실제 운영에서 필요해지면 프로젝트별 커스텀 상태로 확장한다.

## 5. DB 설계 초안

기존 `projects`, `project_members`, `profiles`, `tasks`, `companies`, `team_members`를 공유한다.

### issue_items

```sql
id uuid primary key
project_id uuid not null references projects(id) on delete cascade
related_task_id uuid null references tasks(id) on delete set null
issue_no text not null
title text not null
description text
system_name text
status text not null default '접수'
legacy_status text
priority text not null default 'normal'
requester_name text
assignee_user_id uuid null references profiles(id) on delete set null
assignee_name text
company_id uuid null references companies(id) on delete set null
received_at date
due_date date
completed_at date
settlement_status text not null default '미정산'
progress numeric(5,2) not null default 0
source_url text
created_by uuid null references profiles(id) on delete set null
updated_by uuid null references profiles(id) on delete set null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
unique(project_id, issue_no)
```

### issue_comments

```sql
id uuid primary key
project_id uuid not null references projects(id) on delete cascade
issue_id uuid not null references issue_items(id) on delete cascade
author_user_id uuid null references profiles(id) on delete set null
author_name text
body text not null
commented_at timestamptz not null default now()
created_at timestamptz not null default now()
```

### issue_work_logs

```sql
id uuid primary key
project_id uuid not null references projects(id) on delete cascade
issue_id uuid not null references issue_items(id) on delete cascade
worker_user_id uuid null references profiles(id) on delete set null
worker_name text not null
company_id uuid null references companies(id) on delete set null
work_date date not null
hours numeric(6,2) not null default 0
body text not null
note text
settlement_month text
settled boolean not null default false
created_by uuid null references profiles(id) on delete set null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

### issue_attachments

MVP에서는 URL/관련자료 링크만 먼저 둔다. 파일 업로드가 필요해지면 workspace attachments 패턴을 재사용한다.

## 6. RLS/권한

MVP는 기존 프로젝트 권한 함수를 재사용한다.

- 조회: `is_project_member(project_id)`
- 생성/수정/삭제: `is_project_editor(project_id)`

이후 내부 협업과 외부 WBS 협업을 분리해야 하면 모듈 권한 테이블을 추가한다.

```sql
project_module_permissions
  project_id
  user_id
  module text check (module in ('wbs', 'issues'))
  permission text check (permission in ('none', 'read', 'write', 'admin'))
```

초기 구현에서는 테이블을 만들지 않고, 설계 여지로만 둔다.

## 7. UI 구조

### 프로젝트 홈/헤더

프로젝트 전환은 유지하고, 프로젝트 내부 모듈 스위처를 둔다.

```
[프로젝트명]  WBS | 이슈 | 문서 | 설정
```

처음에는 `WBS | 이슈`만 노출해도 된다.

### 이슈 목록

운영/정산 도구이므로 카드형보다 밀도 있는 테이블을 기본으로 한다.

컬럼:

- 상태
- 이슈번호
- 사업/시스템
- 제목
- 담당자
- 업체
- 접수일
- 완료일
- 누적공수
- 정산상태
- 최근이력

필터:

- 상태
- 담당자
- 업체
- 접수/작업 기간
- 정산 여부
- 검색어

### 이슈 상세

상단:

- 이슈번호, 제목, 상태, 담당자, 누적공수

본문:

- 설명
- 관련 WBS 작업
- 관련 링크/자료
- 처리이력 타임라인
- 공수 로그 테이블

액션:

- 상태 변경
- 이력 추가
- 공수 추가
- 완료 처리

## 8. 구현 단계

### 개발 진행 원칙

- 각 Phase는 작게 커밋하고 빌드 확인 후 다음 Phase로 넘어간다.
- WBS 기존 동작을 깨지 않는 것을 최우선으로 한다.
- DB 구조는 먼저 만들되, UI는 더미가 아니라 실제 Supabase store에 바로 연결한다.
- CSV 가져오기는 화면 MVP가 안정된 뒤 붙인다.
- 공수는 이슈 본문 필드가 아니라 `issue_work_logs` 기준으로만 집계한다.

### Phase 0: 설계 고정

- 이 문서 검토
- 상태명 확정
- 구글시트 CSV 컬럼 매핑 확인

완료 기준:

- 실제 Google Sheet export 가능 여부 확인
- 원본 컬럼과 DB 매핑 확정
- MVP 상태값 확정

### Phase 1: DB 마이그레이션

- `018_issue_tracker.sql` 추가
- 3개 핵심 테이블 생성: `issue_items`, `issue_comments`, `issue_work_logs`
- RLS 정책 추가
- 인덱스 추가

세부 작업:

1. `issue_items` 테이블 생성
2. `issue_comments` 테이블 생성
3. `issue_work_logs` 테이블 생성
4. `updated_at` 트리거 적용
5. 프로젝트/이슈/날짜/상태/담당자 기준 인덱스 추가
6. RLS 활성화
7. `is_project_member`, `is_project_editor` 기반 정책 추가

완료 기준:

- 마이그레이션 SQL이 기존 패턴과 일관됨
- 테이블 간 FK/삭제 정책이 명확함
- `npm run build` 통과

### Phase 2: 타입/스토어

- `src/lib/issue-types.ts`
- `src/stores/issue-store.ts`
- Supabase CRUD 함수
- 프로젝트 전환 시 이슈/공수 로드

세부 작업:

1. 이슈/댓글/공수 타입 정의
2. DB row 변환 함수 작성
3. `loadIssues(projectId)` 구현
4. `createIssue`, `updateIssue`, `deleteIssue` 구현
5. `addComment`, `updateComment`, `deleteComment` 구현
6. `addWorkLog`, `updateWorkLog`, `deleteWorkLog` 구현
7. `getIssueSummary` 또는 selector로 누적공수/최근이력 계산

완료 기준:

- store 단독으로 CRUD 호출 가능
- 낙관적 업데이트는 최소화하고 DB 결과 기준으로 동기화
- 타입스크립트 빌드 통과

### Phase 3: 라우팅/전환

- `/projects/:projectId/issues` 라우트 추가
- 기존 프로젝트 화면에서 이슈 화면 링크 추가
- 이슈 화면에서 WBS 화면 링크 추가

세부 작업:

1. 라우터에서 `/projects/:projectId/issues` 추가
2. 기존 `/projects/:projectId`는 WBS 기본 진입으로 유지
3. 프로젝트 헤더 또는 AppShell에 `WBS | 이슈` 모듈 스위처 추가
4. 이슈 화면 진입 시 프로젝트/멤버/이슈 데이터 로드
5. 모바일에서는 일단 WBS 기존 모바일 흐름 유지, 이슈는 데스크톱 우선

완료 기준:

- 어느 쪽 URL로 들어가도 같은 프로젝트 컨텍스트를 공유
- WBS 화면과 이슈 화면 왕복 가능
- 기존 프로젝트 대시보드/설정 진입 영향 없음

### Phase 4: 화면 MVP

- `IssueTrackerView`
- `IssueTable`
- `IssueDetailPanel`
- `IssueFormDialog`
- `IssueWorkLogForm`
- 기본 필터/검색

세부 작업:

1. 이슈 목록 레이아웃 구현
2. 상태/담당자/검색어 필터 구현
3. 이슈 생성/수정 다이얼로그 구현
4. 행 선택 시 상세 패널 표시
5. 상세 패널에서 처리이력 추가
6. 상세 패널에서 공수 추가
7. 상태 변경 액션 구현

완료 기준:

- 이슈 생성 후 목록/상세에 즉시 반영
- 댓글과 공수가 실제 DB에 저장됨
- 누적공수와 최근이력이 목록에 표시됨

### Phase 5: 요약/정산

- 목록 상단에 월별 공수 요약
- 업체별/담당자별 공수 합계
- 정산상태 토글

세부 작업:

1. 선택 월 기준 공수 합계
2. 담당자별 공수 합계
3. 업체별 공수 합계
4. 정산/미정산 필터
5. 이슈별 정산상태 표시

완료 기준:

- 이번 달 지급 근거를 이슈/작업자/업체 단위로 확인 가능
- 공수 합계가 `issue_work_logs` 기준으로 계산됨

### Phase 6: CSV 가져오기

- 구글시트 이슈 CSV 매핑
- 처리이력 본문을 `issue_comments`로 분해하는 보조 파서
- 작업공수 CSV를 `issue_work_logs`로 가져오기

세부 작업:

1. `업무관리대장` CSV 업로드/붙여넣기 parser
2. 상단 2행 skip, 3행 header 처리
3. `Task ID` 기준 upsert
4. 빈 헤더 메모 칼럼을 처리이력으로 import
5. 상태값 legacy mapping
6. 공수 시트 CSV parser 별도 작성
7. import preview 화면 추가

완료 기준:

- 기존 원장 CSV 일부 샘플을 가져올 수 있음
- 중복 Task ID는 업데이트 또는 skip 정책을 선택 가능
- 처리이력 원문을 잃지 않음

## 8.1 실제 개발 커밋 순서

1. `db: add issue tracker tables`
   - Phase 1 전체
2. `feat(issues): add issue types and store`
   - Phase 2 핵심 CRUD
3. `feat(issues): add project issue route`
   - Phase 3 라우팅/전환
4. `feat(issues): add issue list and detail shell`
   - Phase 4 목록/상세 UI 골격
5. `feat(issues): enable issue comments and work logs`
   - Phase 4 저장 액션
6. `feat(issues): add effort summary`
   - Phase 5 요약/정산
7. `feat(issues): import source sheet csv`
   - Phase 6 CSV 가져오기
8. `test(issues): verify mvp flows`
   - 빌드, 주요 CRUD, 기존 WBS 회귀 확인

## 9. CSV 매핑 초안

### 확인된 원본 시트

- 문서명: `수협통합유지보수(투입관리대장)`
- 탭: `업무관리대장`
- Google Sheet gid: `828773738`
- CSV export 확인: `export?format=csv&gid=828773738`
- 확인 시점: 2026-04-29
- 정규식 기준 고유 Task ID 약 198건 확인

실제 시트는 상단 1행 제목, 2행 요약값, 3행 헤더, 4행부터 데이터 구조다. CSV 가져오기에서는 1~2행을 건너뛰고 3행을 헤더로 사용한다.

확인된 헤더:

| 컬럼 | 시트 헤더 | 용도 |
|---|---|---|
| A | NO | import_sequence |
| B | 사업명 | system_name |
| C | Task ID | issue_no |
| D | Task 내용 | title + description |
| E | 관련 자료 | source_url 또는 attachment note |
| F | 요청자 | requester_name |
| G | 등록일자 | received_at |
| H | 마감요청 일자 | due_date |
| I | 예상투입 공수(D) | estimated_effort |
| J | 작업시작일자 | started_at 후보 |
| K | 작업종료일자 | completed_at 후보 |
| L | 실투입 공수(D) | actual_effort 후보 |
| M | 투입합계 공수(D) | total_effort 후보 |
| N | 완료여부 | 실제로는 status/legacy_status |
| O | 빈 헤더 | 처리이력/메모 |
| P | 선행TASK | predecessor_issue_no 또는 legacy_predecessor |

주의: `완료여부`는 이름과 다르게 `사업-접수`, `개발-검토`, `개발-공수정산`, `완료`, `미처리`, `보류` 같은 상태값으로 쓰이고 있다. 따라서 DB에는 `status`와 `legacy_status`로 매핑한다.

### 이슈 시트

| 구글시트 | DB |
|---|---|
| NO | import_sequence |
| 사업명 | system_name 또는 project category |
| Task ID | issue_no |
| 내용 | title + description |
| 관련자료 | source_url 또는 attachment note |
| 담당자 | assignee_name |
| 접수일 | received_at |
| 진척/공수 | progress 또는 별도 work_logs |
| 상태 | legacy_status + status 매핑 |
| 처리이력 | issue_comments |

### 개발자 공수 시트

| 구글시트 | DB |
|---|---|
| 사업명 | system_name |
| Task ID | issue_no 연결키 |
| 작업일자 | work_date |
| 작업자 | worker_name |
| 작업시각(D) | hours |
| 작업내역 | body |
| 비고 | note |

## 10. 리스크

- 기존 시트의 한 셀 처리이력은 형식이 일정하지 않을 수 있다.
- `Task ID`가 WBS task id와 충돌할 수 있으므로 이슈번호는 `issue_no`로 분리한다.
- 외부업체와 내부인력 권한 분리는 MVP 이후가 안전하다.
- 공수는 지급근거이므로 삭제보다 수정이력/감사 로그가 필요해질 수 있다.

## 11. MVP 완료 기준

- 프로젝트 안에서 WBS와 이슈 화면을 오갈 수 있다.
- 이슈를 등록하고 상태를 바꿀 수 있다.
- 이슈 상세에 처리이력과 공수를 여러 건 남길 수 있다.
- 이슈 목록에서 누적공수와 최근이력을 볼 수 있다.
- 월별/업체별/담당자별 공수 합계를 볼 수 있다.
- 기존 WBS 화면 동작을 깨지 않는다.
