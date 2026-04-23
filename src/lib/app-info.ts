export interface AppUpdateItem {
  version: string
  releasedAt: string
  title: string
  summary: string
  items: string[]
}

export const APP_INFO = {
  name: 'GMT Gantt',
  version: '0.9.0',
  channel: 'Public Preview',
  updatedAt: '2026-04-24',
  description: 'WBS, 간트, 담당자 업무, 업무노트를 한 화면 흐름으로 관리하는 내부 프로젝트 운영 도구입니다.',
} as const

export const APP_UPDATES: AppUpdateItem[] = [
  {
    version: '0.9.0',
    releasedAt: '2026-04-24',
    title: '업무노트와 장문 편집 안정화',
    summary: '업무노트와 작업 상세 메모 흐름을 공개 운영 기준에 맞춰 정리했습니다.',
    items: [
      '업무노트 장문 편집기를 Plate 기반으로 교체해 제목, 목록, 표, 이미지 붙여넣기를 안정화했습니다.',
      'Task 본문, 세부항목 메모, 내 업무/담당자 업무 메모까지 같은 편집 경험으로 통일했습니다.',
      '새 문서와 폴더의 기본 공개 범위를 비공개로 맞추고 WBS 연결 흐름을 정리했습니다.',
    ],
  },
  {
    version: '0.8.0',
    releasedAt: '2026-04-23',
    title: '업무노트 구조 개편',
    summary: '업무노트를 WBS 보조 문서 공간으로 확장했습니다.',
    items: [
      '업무노트 전용 메뉴, 폴더/문서 트리, WBS 연결 기능을 추가했습니다.',
      '공유/보안 설정, 수정 이력, 첨부 파일 영역을 도입했습니다.',
      '문서 검색과 트리 이동 기반으로 문서 관리 구조를 정비했습니다.',
    ],
  },
  {
    version: '0.7.0',
    releasedAt: '2026-04-22',
    title: '간트 사용성 개선',
    summary: '실무 운영에 필요한 표시/조작 기능을 다듬었습니다.',
    items: [
      '레벨 펼치기, 줄 간격 조절, 필터 패널, 상단 요약 지표를 추가했습니다.',
      '프로젝트/조직/담당자 중심 화면의 시각 계층과 색 구분을 보강했습니다.',
      '상세 모달과 카드형 업무 화면의 표시 항목을 운영 흐름에 맞게 조정했습니다.',
    ],
  },
]
