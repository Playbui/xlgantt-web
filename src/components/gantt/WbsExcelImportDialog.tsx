import { useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, RefreshCw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { buildTasksFromExcelRows, parseWbsExcelFile, type WbsExcelRow } from '@/lib/wbs-excel'
import { useTaskStore } from '@/stores/task-store'
import { useResourceStore } from '@/stores/resource-store'
import { supabase } from '@/lib/supabase'

interface WbsExcelImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  currentMaxSortOrder: number
  onImported: () => void
}

type ValidationState = 'idle' | 'validating' | 'ready' | 'error' | 'importing'
type ImportMode = 'append' | 'replace'

export function WbsExcelImportDialog({
  open,
  onOpenChange,
  projectId,
  currentMaxSortOrder,
  onImported,
}: WbsExcelImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addTasksBulk = useTaskStore((s) => s.addTasksBulk)
  const currentTasks = useTaskStore((s) => s.tasks)
  const setTasks = useTaskStore((s) => s.setTasks)
  const setDependencies = useTaskStore((s) => s.setDependencies)

  const [selectedFileName, setSelectedFileName] = useState('')
  const [validationState, setValidationState] = useState<ValidationState>('idle')
  const [validatedRows, setValidatedRows] = useState<WbsExcelRow[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [importMode, setImportMode] = useState<ImportMode>('append')
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false)

  const resetState = () => {
    setSelectedFileName('')
    setValidationState('idle')
    setValidatedRows([])
    setValidationErrors([])
    setImportMode('append')
    setConfirmReplaceOpen(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetState()
    onOpenChange(nextOpen)
  }

  const handleSelectFile = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setSelectedFileName(file.name)
    setValidationState('validating')
    setValidatedRows([])
    setValidationErrors([])

    try {
      const result = await parseWbsExcelFile(file)
      setValidatedRows(result.rows)
      setValidationErrors(result.errors)
      setValidationState(result.errors.length > 0 ? 'error' : 'ready')
    } catch (error) {
      console.error('엑셀 검증 실패:', error)
      setValidationErrors(['파일을 읽는 중 오류가 발생했습니다. 엑셀 형식과 내용을 확인해주세요.'])
      setValidationState('error')
    }
  }

  const executeImport = async () => {
    if (validationState !== 'ready' || validatedRows.length === 0) return

    setValidationState('importing')
    try {
      const importedTasks = buildTasksFromExcelRows({
        projectId,
        startSortOrder: importMode === 'replace' ? 1000 : currentMaxSortOrder + 1000,
        rows: validatedRows,
      })

      if (importMode === 'replace') {
        const projectTaskIds = currentTasks
          .filter((task) => task.project_id === projectId)
          .map((task) => task.id)

        if (projectTaskIds.length > 0) {
          await supabase.from('task_assignments').delete().in('task_id', projectTaskIds)
          await supabase.from('task_details').delete().in('task_id', projectTaskIds)
        }
        await supabase.from('dependencies').delete().eq('project_id', projectId)
        await supabase.from('tasks').delete().eq('project_id', projectId)

        setTasks([])
        setDependencies([])
        useResourceStore.setState((state) => ({
          assignments: state.assignments.filter((assignment) => !projectTaskIds.includes(assignment.task_id)),
          taskDetails: state.taskDetails.filter((detail) => !projectTaskIds.includes(detail.task_id)),
        }))
      }

      addTasksBulk(importedTasks)
      onImported()
      handleOpenChange(false)
      alert(importMode === 'replace'
        ? `${validatedRows.length}개 작업으로 전체 대체를 완료했습니다.`
        : `${validatedRows.length}개 작업을 추가 등록했습니다.`)
    } catch (error) {
      console.error('엑셀 등록 실패:', error)
      setValidationErrors(['등록 중 오류가 발생했습니다. 다시 시도해주세요.'])
      setValidationState('error')
    }
  }

  const handleImport = async () => {
    if (importMode === 'replace') {
      setConfirmReplaceOpen(true)
      return
    }
    await executeImport()
  }

  const summary = useMemo(() => {
    const levelCounts = validatedRows.reduce<Record<number, number>>((acc, row) => {
      const level = row.wbs.split('.').length
      acc[level] = (acc[level] || 0) + 1
      return acc
    }, {})
    return Object.entries(levelCounts)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([level, count]) => `Lv${level} ${count}건`)
      .join(' / ')
  }, [validatedRows])

  const previewRows = useMemo(() => validatedRows.slice(0, 12), [validatedRows])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="border-b border-border/70 bg-muted/30 px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            WBS 엑셀 일괄등록
          </DialogTitle>
          <DialogDescription>
            파일 선택부터 정합성 검증, 등록 직전 확인까지 이 창에서 진행합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
            <div className="font-semibold">현재 등록 방식</div>
            <div className="mt-1 leading-6">
              {importMode === 'append'
                ? '기존 데이터를 지우거나 덮어쓰지 않고, 검증을 통과한 행만 현재 프로젝트 뒤에 추가 등록합니다. 기존 파일을 다시 올리면 업데이트가 아니라 중복 추가될 수 있습니다.'
                : '현재 프로젝트의 WBS 작업, 의존관계, 담당자 배정, 세부항목을 모두 비우고 엑셀 내용으로 다시 구성합니다. 기존 작업 이력은 이 화면 기준으로 대체됩니다.'}
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-4">
            <div className="text-sm font-semibold text-foreground">등록 모드</div>
            <div className="mt-1 text-xs text-muted-foreground">
              업로드 파일을 기존 데이터에 덧붙일지, 현재 WBS를 통째로 바꿀지 선택하세요.
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setImportMode('append')}
                className={`rounded-xl border px-4 py-4 text-left transition-colors ${importMode === 'append' ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-background hover:bg-muted/30'}`}
              >
                <div className="font-semibold text-foreground">추가 등록</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  기존 데이터 유지, 업로드한 행만 새로 추가
                </div>
              </button>
              <button
                type="button"
                onClick={() => setImportMode('replace')}
                className={`rounded-xl border px-4 py-4 text-left transition-colors ${importMode === 'replace' ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-300' : 'border-border bg-background hover:bg-muted/30'}`}
              >
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <RefreshCw className="h-4 w-4" />
                  전체 대체
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  현재 프로젝트 WBS를 비우고 업로드 파일로 다시 구성
                </div>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-foreground">엑셀 파일 선택</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  양식 파일로 작성한 `.xlsx` 또는 `.xls`를 선택하세요.
                </div>
              </div>
              <Button type="button" variant="outline" onClick={handleSelectFile}>
                <Upload className="mr-2 h-4 w-4" />
                파일 선택
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-sm">
              {selectedFileName || '아직 선택된 파일이 없습니다.'}
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">검증 상태</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  필수값, 레벨 구조, 날짜, 수치 범위를 검사합니다.
                </div>
              </div>

              {validationState === 'validating' && (
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  검증 중
                </div>
              )}

              {validationState === 'ready' && (
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  검증 완료
                </div>
              )}

              {validationState === 'error' && (
                <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                  <AlertCircle className="h-3.5 w-3.5" />
                  오류 있음
                </div>
              )}
            </div>

            {validatedRows.length > 0 && (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">행 수</div>
                  <div className="mt-1 text-xl font-semibold">{validatedRows.length}</div>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 md:col-span-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">레벨 분포</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{summary || '분석 대기'}</div>
                </div>
              </div>
            )}

            {validationErrors.length > 0 && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/80 p-4">
                <div className="text-sm font-semibold text-rose-800">검증 오류 {validationErrors.length}건</div>
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 text-sm text-rose-900">
                  {validationErrors.map((error) => (
                    <div key={error} className="rounded-md border border-rose-200/70 bg-white/70 px-3 py-2">
                      {error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {validationState === 'ready' && validationErrors.length === 0 && validatedRows.length > 0 && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900">
                검증을 통과했습니다. 아래 미리보기 내용을 확인한 뒤 등록을 실행하세요.
              </div>
            )}

            {validatedRows.length > 0 && (
              <div className="mt-4 rounded-lg border border-border/80">
                <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                  <div className="text-sm font-semibold">검증 미리보기</div>
                  <div className="text-xs text-muted-foreground">
                    {previewRows.length} / {validatedRows.length}행 표시
                  </div>
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/70">
                      <tr className="border-b border-border/70 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        <th className="px-4 py-2">WBS</th>
                        <th className="px-4 py-2">작업명</th>
                        <th className="px-4 py-2">마일스톤</th>
                        <th className="px-4 py-2">기간</th>
                        <th className="px-4 py-2">작업량</th>
                        <th className="px-4 py-2">비고</th>
                        <th className="px-4 py-2">산출물</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row) => (
                        <tr key={`${row.row_no}-${row.wbs}`} className="border-b border-border/50 last:border-b-0">
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{row.wbs}</td>
                          <td className="px-4 py-2 font-medium text-foreground">{row.task_name}</td>
                          <td className="px-4 py-2 text-muted-foreground">{row.is_milestone ? 'Y' : '-'}</td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {row.planned_start || '-'} ~ {row.planned_end || '-'}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{row.total_workload ?? '-'}</td>
                          <td className="px-4 py-2 text-muted-foreground">{row.remarks || '-'}</td>
                          <td className="px-4 py-2 text-muted-foreground">{row.deliverables || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            닫기
          </Button>
          <Button onClick={handleImport} disabled={validationState !== 'ready' || validatedRows.length === 0}>
            {validationState === 'importing' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {importMode === 'replace' ? '전체 대체 실행' : '등록 실행'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={confirmReplaceOpen} onOpenChange={setConfirmReplaceOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertCircle className="h-5 w-5" />
              전체 대체 최종 확인
            </DialogTitle>
            <DialogDescription>
              이 작업은 현재 프로젝트의 기존 WBS 데이터를 비우고, 검증을 통과한 엑셀 내용으로 다시 구성합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-amber-950">
              <div className="font-semibold">삭제 후 다시 구성되는 항목</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>현재 프로젝트의 WBS 작업</li>
                <li>의존관계</li>
                <li>담당자 배정</li>
                <li>세부항목</li>
              </ul>
            </div>

            <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">등록 예정</div>
              <div className="mt-2 text-base font-semibold">{validatedRows.length}개 작업</div>
              <div className="mt-1 text-sm text-muted-foreground">{summary || '레벨 정보 없음'}</div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReplaceOpen(false)}>
              취소
            </Button>
            <Button
              variant="default"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={async () => {
                setConfirmReplaceOpen(false)
                await executeImport()
              }}
            >
              전체 대체 확정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
