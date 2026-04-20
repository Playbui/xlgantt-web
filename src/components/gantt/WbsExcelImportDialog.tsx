import { useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { buildTasksFromExcelRows, parseWbsExcelFile, type WbsExcelRow } from '@/lib/wbs-excel'
import { useTaskStore } from '@/stores/task-store'

interface WbsExcelImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  currentMaxSortOrder: number
  onImported: () => void
}

type ValidationState = 'idle' | 'validating' | 'ready' | 'error' | 'importing'

export function WbsExcelImportDialog({
  open,
  onOpenChange,
  projectId,
  currentMaxSortOrder,
  onImported,
}: WbsExcelImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addTasksBulk = useTaskStore((s) => s.addTasksBulk)

  const [selectedFileName, setSelectedFileName] = useState('')
  const [validationState, setValidationState] = useState<ValidationState>('idle')
  const [validatedRows, setValidatedRows] = useState<WbsExcelRow[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const resetState = () => {
    setSelectedFileName('')
    setValidationState('idle')
    setValidatedRows([])
    setValidationErrors([])
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

  const handleImport = async () => {
    if (validationState !== 'ready' || validatedRows.length === 0) return

    setValidationState('importing')
    try {
      const importedTasks = buildTasksFromExcelRows({
        projectId,
        startSortOrder: currentMaxSortOrder + 1000,
        rows: validatedRows,
      })
      addTasksBulk(importedTasks)
      onImported()
      handleOpenChange(false)
      alert(`${validatedRows.length}개 작업을 추가 등록했습니다.`)
    } catch (error) {
      console.error('엑셀 등록 실패:', error)
      setValidationErrors(['등록 중 오류가 발생했습니다. 다시 시도해주세요.'])
      setValidationState('error')
    }
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
              기존 데이터를 지우거나 덮어쓰지 않고, 검증을 통과한 행만 현재 프로젝트 뒤에 추가 등록합니다.
              기존 파일을 다시 올리면 업데이트가 아니라 중복 추가될 수 있습니다.
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
                검증을 통과했습니다. 아래 등록 버튼을 누르면 현재 프로젝트에 작업이 추가됩니다.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            닫기
          </Button>
          <Button
            onClick={handleImport}
            disabled={validationState !== 'ready' || validatedRows.length === 0}
          >
            {validationState === 'importing' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            등록 실행
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
