import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, FilePlus2, Link2, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { RichContentEditor } from '@/components/task-workspace/RichContentEditor'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import { cn } from '@/lib/utils'

const STATUS_LABELS = {
  draft: '초안',
  active: '진행중',
  done: '완료',
  archived: '보관',
} as const

function WorkspaceStatusBadge({ status }: { status: keyof typeof STATUS_LABELS }) {
  const tone =
    status === 'active'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : status === 'done'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : status === 'archived'
          ? 'bg-slate-100 text-slate-600 border-slate-200'
          : 'bg-amber-50 text-amber-700 border-amber-200'

  return (
    <Badge variant="outline" className={cn('h-5 px-2 text-[10px]', tone)}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

export function WorkspaceView() {
  const { items, selectedItemId, createItem, selectItem, updateItem, deleteItem, isLoading } = useWorkspaceStore()
  const tasks = useTaskStore((s) => s.tasks)
  const currentProject = useProjectStore((s) => s.currentProject)

  const [query, setQuery] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const saveTimerRef = useRef<number | null>(null)

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items
    return items.filter((item) =>
      [item.title, item.summary || '', item.body || ''].some((value) => value.toLowerCase().includes(normalized))
    )
  }, [items, query])

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ??
    filteredItems[0] ??
    items[0] ??
    null

  const linkedTasks = useMemo(() => {
    if (!selectedItem) return []
    return selectedItem.linkedTaskIds
      .map((taskId) => tasks.find((task) => task.id === taskId))
      .filter(Boolean)
  }, [selectedItem, tasks])

  const availableTasks = useMemo(() => {
    if (!selectedItem) return tasks
    const linked = new Set(selectedItem.linkedTaskIds)
    return tasks.filter((task) => !linked.has(task.id))
  }, [selectedItem, tasks])

  useEffect(() => {
    if (!selectedItem && items.length > 0) {
      selectItem(items[0].id)
    }
  }, [items, selectedItem, selectItem])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  const scheduleUpdate = (changes: Parameters<typeof updateItem>[1]) => {
    if (!selectedItem) return
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = window.setTimeout(() => {
      void updateItem(selectedItem.id, changes)
    }, 250)
  }

  const insertLinkCard = async () => {
    if (!selectedItem || !linkTitle.trim() || !linkUrl.trim()) return
    const nextLinks = [
      ...selectedItem.links,
      {
        id: crypto.randomUUID(),
        title: linkTitle.trim(),
        url: linkUrl.trim(),
      },
    ]

    const linkCard = `<div data-link-card="true" style="margin:12px 0; border:1px solid rgba(148,163,184,.28); border-radius:12px; padding:12px 14px; background:rgba(248,250,252,.92);"><div style="font-size:13px; font-weight:600; color:#0f172a;">${linkTitle.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</div><a href="${linkUrl}" target="_blank" rel="noreferrer" style="display:block; margin-top:4px; font-size:12px; color:#2563eb; text-decoration:none;">${linkUrl.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</a></div><p></p>`

    await updateItem(selectedItem.id, {
      links: nextLinks,
      body: `${selectedItem.body || ''}${selectedItem.body?.trim() ? '\n' : ''}${linkCard}`,
    })
    setLinkTitle('')
    setLinkUrl('')
  }

  const toggleTaskLink = (taskId: string) => {
    if (!selectedItem) return
    const linked = selectedItem.linkedTaskIds.includes(taskId)
    void updateItem(selectedItem.id, {
      linkedTaskIds: linked
        ? selectedItem.linkedTaskIds.filter((id) => id !== taskId)
        : [...selectedItem.linkedTaskIds, taskId],
    })
  }

  const handleDeleteSelected = async () => {
    if (!selectedItem) return
    await deleteItem(selectedItem.id)
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] bg-background">
      <aside className="flex min-h-0 flex-col border-r border-border/60 bg-slate-50/70">
        <div className="border-b border-border/60 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-foreground">업무노트</div>
              <p className="mt-1 text-xs text-muted-foreground">별도 항목을 만들고 WBS와 연결해 관리합니다.</p>
            </div>
            <Button size="sm" className="h-8 gap-1.5" onClick={() => currentProject && createItem(currentProject.id)} disabled={!currentProject}>
              <FilePlus2 className="h-3.5 w-3.5" />
              새 항목
            </Button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="제목, 요약, 본문 검색"
              className="h-9 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filteredItems.map((item) => {
            const isActive = item.id === selectedItem?.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectItem(item.id)}
                className={cn(
                  'mb-2 w-full rounded-xl border px-3 py-3 text-left transition-colors',
                  isActive
                    ? 'border-primary/30 bg-primary/5 shadow-sm'
                    : 'border-border/60 bg-background hover:bg-accent/40'
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{item.title || '제목 없음'}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {item.summary || '요약이 없습니다.'}
                    </div>
                  </div>
                  <WorkspaceStatusBadge status={item.status} />
                </div>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>연결 WBS {item.linkedTaskIds.length}</span>
                  <span>링크 {item.links.length}</span>
                  <span>{new Date(item.updated_at).toLocaleDateString('ko-KR')}</span>
                </div>
              </button>
            )
          })}
          {filteredItems.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 bg-background px-4 py-10 text-center text-sm text-muted-foreground">
              검색 결과가 없습니다.
            </div>
          )}
        </div>
      </aside>

      <section className="min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
            업무노트를 불러오는 중입니다...
          </div>
        ) : selectedItem ? (
          <div className="grid min-h-full grid-cols-[minmax(0,1fr)_320px]">
            <div className="border-r border-border/60 px-6 py-5">
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <WorkspaceStatusBadge status={selectedItem.status} />
                    <span className="text-xs text-muted-foreground">
                      마지막 수정 {new Date(selectedItem.updated_at).toLocaleString('ko-KR')}
                    </span>
                  </div>
                  <Input
                    value={selectedItem.title}
                    onChange={(e) => scheduleUpdate({ title: e.target.value })}
                    placeholder="업무노트 제목"
                    className="mt-3 h-11 border-none px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
                  />
                </div>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-red-600" onClick={() => void handleDeleteSelected()}>
                  <Trash2 className="h-3.5 w-3.5" />
                  삭제
                </Button>
              </div>

              <div className="mt-5 space-y-5">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">한 줄 요약</div>
                  <textarea
                    value={selectedItem.summary}
                    onChange={(e) => scheduleUpdate({ summary: e.target.value })}
                    rows={3}
                    placeholder="이 항목의 핵심 상황이나 지금까지의 결론을 짧게 정리하세요."
                    className="min-h-[92px] w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring/20"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">본문</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      자동 저장
                    </div>
                  </div>
                  <RichContentEditor
                    value={selectedItem.body || ''}
                    onChange={(value) => scheduleUpdate({ body: value })}
                    minHeight={520}
                    placeholder={'예)\n- 조사 배경\n- 비교안\n- 회의 메모\n- 미결 이슈\n- 다음 액션'}
                  />
                </div>
              </div>
            </div>

            <aside className="space-y-5 px-5 py-5">
              <div className="rounded-xl border border-border/60 bg-card">
                <div className="border-b border-border/60 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">상태</div>
                </div>
                <div className="space-y-2 px-4 py-4">
                  {(['draft', 'active', 'done', 'archived'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => void updateItem(selectedItem.id, { status })}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm',
                        selectedItem.status === status
                          ? 'border-primary/30 bg-primary/5 text-primary'
                          : 'border-border/60 hover:bg-accent/40'
                      )}
                    >
                      <span>{STATUS_LABELS[status]}</span>
                      {selectedItem.status === status && <CheckCircle2 className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card">
                <div className="border-b border-border/60 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">본문 링크 카드</div>
                </div>
                <div className="space-y-2 px-4 py-4">
                  <Input
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                    placeholder="링크 제목"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://..."
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-full gap-1.5"
                    onClick={() => void insertLinkCard()}
                    disabled={!linkTitle.trim() || !linkUrl.trim()}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    본문에 링크 카드 삽입
                  </Button>

                  {selectedItem.links.length > 0 && (
                    <div className="space-y-2 border-t border-border/60 pt-3">
                      {selectedItem.links.map((link) => (
                        <a
                          key={link.id}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-lg border border-border/60 px-3 py-2 text-xs hover:bg-accent/40"
                        >
                          <div className="font-medium text-foreground">{link.title}</div>
                          <div className="mt-1 truncate text-muted-foreground">{link.url}</div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card">
                <div className="border-b border-border/60 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">연결된 WBS</div>
                </div>
                <div className="space-y-2 px-4 py-4">
                  {linkedTasks.length > 0 ? (
                    linkedTasks.map((task) => (
                      <button
                        key={task!.id}
                        type="button"
                        onClick={() => void toggleTaskLink(task!.id)}
                        className="flex w-full items-start justify-between rounded-lg border border-border/60 px-3 py-2 text-left hover:bg-accent/40"
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] font-mono text-muted-foreground">{task!.wbs_code}</div>
                          <div className="truncate text-sm font-medium">{task!.task_name}</div>
                        </div>
                        <Badge variant="outline" className="ml-2 h-5 px-2 text-[10px]">
                          연결됨
                        </Badge>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
                      아직 연결된 WBS가 없습니다.
                    </div>
                  )}
                </div>

                <div className="border-t border-border/60 px-4 py-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">WBS 연결 추가</div>
                  <div className="max-h-56 space-y-2 overflow-y-auto">
                    {availableTasks.slice(0, 24).map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => void toggleTaskLink(task.id)}
                        className="flex w-full items-start justify-between rounded-lg border border-border/60 px-3 py-2 text-left hover:bg-accent/40"
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] font-mono text-muted-foreground">{task.wbs_code}</div>
                          <div className="truncate text-sm">{task.task_name}</div>
                        </div>
                        <Badge variant="secondary" className="ml-2 h-5 px-2 text-[10px]">
                          추가
                        </Badge>
                      </button>
                    ))}
                    {availableTasks.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
                        추가할 WBS가 없습니다.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <div className="rounded-2xl border border-dashed border-border/60 bg-card px-8 py-12 text-center">
              <div className="text-lg font-semibold">업무노트를 만들어보세요</div>
              <p className="mt-2 text-sm text-muted-foreground">새 항목을 만든 뒤 조사 내용과 WBS 연결을 같이 관리할 수 있습니다.</p>
              <Button className="mt-5 gap-1.5" onClick={() => currentProject && createItem(currentProject.id)} disabled={!currentProject}>
                <FilePlus2 className="h-4 w-4" />
                첫 항목 만들기
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
