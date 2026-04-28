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

### Phase 0: 설계 고정

- 이 문서 검토
- 상태명 확정
- 구글시트 CSV 컬럼 매핑 확인

### Phase 1: DB 마이그레이션

- `018_issue_tracker.sql` 추가
- 3개 핵심 테이블 생성: `issue_items`, `issue_comments`, `issue_work_logs`
- RLS 정책 추가
- 인덱스 추가

### Phase 2: 타입/스토어

- `src/lib/issue-types.ts`
- `src/stores/issue-store.ts`
- Supabase CRUD 함수
- 프로젝트 전환 시 이슈/공수 로드

### Phase 3: 라우팅/전환

- `/projects/:projectId/issues` 라우트 추가
- 기존 프로젝트 화면에서 이슈 화면 링크 추가
- 이슈 화면에서 WBS 화면 링크 추가

### Phase 4: 화면 MVP

- `IssueTrackerView`
- `IssueTable`
- `IssueDetailPanel`
- `IssueFormDialog`
- `IssueWorkLogForm`
- 기본 필터/검색

### Phase 5: 요약/정산

- 목록 상단에 월별 공수 요약
- 업체별/담당자별 공수 합계
- 정산상태 토글

### Phase 6: CSV 가져오기

- 구글시트 이슈 CSV 매핑
- 처리이력 본문을 `issue_comments`로 분해하는 보조 파서
- 작업공수 CSV를 `issue_work_logs`로 가져오기

## 9. CSV 매핑 초안

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
