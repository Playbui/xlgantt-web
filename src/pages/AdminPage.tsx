import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarChart3, Plus, Shield, Trash2, KeyRound, ArrowLeft, Loader2, RefreshCw, Building2, FolderTree, Layers3 } from 'lucide-react'
import { useAuthStore, type User, type UserRole } from '@/stores/auth-store'
import { useOrganizationStore } from '@/stores/organization-store'
import { OrganizationTree } from '@/components/organization/OrganizationTree'
import { OrganizationPath } from '@/components/organization/OrganizationPath'
import { OrganizationAssignmentForm } from '@/components/organization/OrganizationAssignmentForm'
import type { OrganizationDraftValue } from '@/lib/organization-types'

export function AdminPage() {
  const navigate = useNavigate()
  const { currentUser, users, updateUser, deleteUser, updatePassword, addUserManual, fetchAllUsers, authMode } = useAuthStore()

  const [showAddUser, setShowAddUser] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('member')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [resetPassword, setResetPassword] = useState('123456')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')

  const [refreshing, setRefreshing] = useState(false)
  const [orgTarget, setOrgTarget] = useState<User | null>(null)
  const [orgDraft, setOrgDraft] = useState<OrganizationDraftValue>({})
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyShortName, setNewCompanyShortName] = useState('')
  const [newDepartmentName, setNewDepartmentName] = useState('')
  const [newDepartmentCompanyId, setNewDepartmentCompanyId] = useState('')
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamDepartmentId, setNewTeamDepartmentId] = useState('')
  const [adminTab, setAdminTab] = useState('users')
  const {
    companies,
    departments,
    teams,
    isLoaded: organizationLoaded,
    loadOrganization,
    addCompany,
    addDepartment,
    addTeam,
    deleteCompany,
    deleteDepartment,
    deleteTeam,
    assignUser,
    getUserAssignment,
  } = useOrganizationStore()

  // Admin guard
  if (!currentUser || currentUser.role !== 'admin') {
    navigate('/projects')
    return null
  }

  // Supabase 모드에서 사용자 목록 불러오기
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (authMode === 'supabase') {
      fetchAllUsers()
    }
  }, [authMode, fetchAllUsers])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    loadOrganization()
  }, [loadOrganization])

  const pendingUsers = useMemo(() => users.filter((user) => !user.approved), [users])
  const approvedUsers = useMemo(() => users.filter((user) => user.approved), [users])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([fetchAllUsers(), loadOrganization()])
    } finally {
      setRefreshing(false)
    }
  }

  const handleAddUser = async () => {
    setAddError('')
    if (!newName || !newEmail || !newPassword) {
      setAddError('모든 필드를 입력하세요')
      return
    }
    if (newPassword.length < 6) {
      setAddError('비밀번호는 최소 6자 이상이어야 합니다')
      return
    }
    setAddLoading(true)
    try {
      const result = await addUserManual(newEmail, newName, newPassword, newRole)
      if (result.success) {
        setShowAddUser(false)
        setNewName('')
        setNewEmail('')
        setNewPassword('')
        setNewRole('member')
        if (authMode === 'supabase') await fetchAllUsers()
      } else {
        setAddError(result.error || '사용자 추가에 실패했습니다')
      }
    } catch {
      setAddError('사용자 추가 중 오류가 발생했습니다')
    } finally {
      setAddLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (resetTarget && resetPassword.length >= 6) {
      setResetLoading(true)
      setResetError('')
      try {
        const result = await updatePassword(resetTarget.id, resetPassword)
        if (!result.success) {
          setResetError(result.error || '비밀번호 초기화에 실패했습니다')
          return
        }
        setResetTarget(null)
        setResetPassword('123456')
        if (result.message) {
          alert(result.message)
        }
      } catch {
        setResetError('비밀번호 초기화 중 오류가 발생했습니다')
      } finally {
        setResetLoading(false)
      }
    }
  }

  const handleRoleChange = async (userId: string, role: UserRole) => {
    await updateUser(userId, { role })
  }

  const handleApprovalToggle = async (user: User) => {
    if (!user.approved && user.role !== 'admin' && !getUserAssignment(user.id)) {
      setOrgTarget(user)
      setOrgDraft({})
      alert('승인 전에 회사와 부서를 먼저 지정해주세요.')
      return
    }
    await updateUser(user.id, { approved: !user.approved })
  }

  const handleDelete = async (userId: string) => {
    if (userId === currentUser.id) return
    if (!confirm('이 사용자를 삭제하시겠습니까?')) return
    await deleteUser(userId)
  }

  const openOrganizationDialog = (user: User) => {
    const assignment = getUserAssignment(user.id)
    setOrgTarget(user)
    setOrgDraft({
      companyId: assignment?.company_id,
      departmentId: assignment?.department_id,
      teamId: assignment?.team_id,
    })
  }

  const handleSaveUserOrganization = async () => {
    if (!orgTarget || !orgDraft.companyId || !orgDraft.departmentId) return
    await assignUser(orgTarget.id, orgDraft)
    setOrgTarget(null)
    setOrgDraft({})
  }

  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) return
    await addCompany({
      name: newCompanyName,
      short_name: newCompanyShortName,
      color: '#2563eb',
    })
    setNewCompanyName('')
    setNewCompanyShortName('')
  }

  const handleAddDepartment = async () => {
    if (!newDepartmentCompanyId || !newDepartmentName.trim()) return
    await addDepartment({
      company_id: newDepartmentCompanyId,
      name: newDepartmentName,
    })
    setNewDepartmentName('')
  }

  const handleAddTeam = async () => {
    if (!newTeamDepartmentId || !newTeamName.trim()) return
    await addTeam({
      department_id: newTeamDepartmentId,
      name: newTeamName,
    })
    setNewTeamName('')
  }

  return (
    <div className="std-page">
      <header className="std-page-header">
        <div className="std-page-header-inner">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
              <BarChart3 className="h-3.5 w-3.5" />
            </div>
            <span className="text-base font-bold tracking-tight">GMTgantts</span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-sm font-medium text-muted-foreground">사용자 관리</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')} className="text-xs h-7">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />프로젝트로
          </Button>
        </div>
      </header>

      <main className="std-page-main">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Shield className="h-5 w-5" />사용자 관리
            </h1>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {users.length}명의 사용자
              {authMode === 'supabase' && <span className="ml-2">(Supabase)</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {authMode === 'supabase' && (
              <Button variant="outline" size="sm" onClick={handleRefresh} className="h-8 text-xs" disabled={refreshing}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} />새로고침
              </Button>
            )}
            <Button size="sm" onClick={() => setShowAddUser(true)} className="h-8 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />사용자 추가
            </Button>
          </div>
        </div>

        <Tabs value={adminTab} onValueChange={setAdminTab} className="mb-5">
          <TabsList className="h-10 bg-muted/40 p-1">
            <TabsTrigger value="users" className="text-xs">사용자 관리</TabsTrigger>
            <TabsTrigger value="organization" className="text-xs">조직 관리</TabsTrigger>
          </TabsList>
        </Tabs>

        {adminTab === 'organization' && (
          <div className="grid gap-5 lg:grid-cols-[360px_1fr] mb-6">
            <div className="space-y-4">
              <div className="std-surface p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">회사 추가</h2>
                </div>
                <div className="space-y-2">
                  <Input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="회사명" className="h-9 text-sm" />
                  <Input value={newCompanyShortName} onChange={(e) => setNewCompanyShortName(e.target.value)} placeholder="약칭" className="h-9 text-sm" />
                  <Button size="sm" className="w-full" onClick={handleAddCompany}>
                    <Plus className="h-3.5 w-3.5 mr-1" />회사 등록
                  </Button>
                </div>
              </div>

              <div className="std-surface p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FolderTree className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">부서 추가</h2>
                </div>
                <div className="space-y-2">
                  <Select value={newDepartmentCompanyId || undefined} onValueChange={(value) => value && setNewDepartmentCompanyId(value)}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="회사 선택">
                        {newDepartmentCompanyId
                          ? companies.find((company) => company.id === newDepartmentCompanyId)?.name
                          : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input value={newDepartmentName} onChange={(e) => setNewDepartmentName(e.target.value)} placeholder="부서명" className="h-9 text-sm" />
                  <Button size="sm" className="w-full" onClick={handleAddDepartment} disabled={!newDepartmentCompanyId}>
                    <Plus className="h-3.5 w-3.5 mr-1" />부서 등록
                  </Button>
                </div>
              </div>

              <div className="std-surface p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Layers3 className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">팀 추가</h2>
                </div>
                <div className="space-y-2">
                  <Select value={newTeamDepartmentId || undefined} onValueChange={(value) => value && setNewTeamDepartmentId(value)}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="부서 선택">
                        {newTeamDepartmentId
                          ? (() => {
                              const department = departments.find((item) => item.id === newTeamDepartmentId)
                              const company = department ? companies.find((item) => item.id === department.company_id) : undefined
                              return department ? `${company?.name || ''}${company ? ' / ' : ''}${department.name}` : undefined
                            })()
                          : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {companies.find((company) => company.id === department.company_id)?.name} / {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="팀명" className="h-9 text-sm" />
                  <Button size="sm" className="w-full" onClick={handleAddTeam} disabled={!newTeamDepartmentId}>
                    <Plus className="h-3.5 w-3.5 mr-1" />팀 등록
                  </Button>
                </div>
              </div>
            </div>

            <div className="std-surface p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold">조직 트리</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    회사 / 부서 / 팀 구조를 관리하고 사용자 배정의 기준으로 사용합니다.
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {organizationLoaded ? `${companies.length}개 회사 · ${departments.length}개 부서 · ${teams.length}개 팀` : '불러오는 중...'}
                </div>
              </div>
              <OrganizationTree
                onDeleteCompany={(id) => {
                  if (confirm('회사를 삭제하시겠습니까? 하위 부서/팀/사용자 연결도 함께 정리됩니다.')) {
                    deleteCompany(id)
                  }
                }}
                onDeleteDepartment={(id) => {
                  if (confirm('부서를 삭제하시겠습니까? 하위 팀과 사용자 연결이 함께 정리됩니다.')) {
                    deleteDepartment(id)
                  }
                }}
                onDeleteTeam={(id) => {
                  if (confirm('팀을 삭제하시겠습니까? 해당 팀 배정은 팀 미지정으로 남습니다.')) {
                    deleteTeam(id)
                  }
                }}
              />
            </div>
          </div>
        )}

        <div className="std-surface overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">이름</TableHead>
                <TableHead className="text-xs">이메일</TableHead>
                <TableHead className="text-xs">조직</TableHead>
                <TableHead className="text-xs">역할</TableHead>
                <TableHead className="text-xs">승인</TableHead>
                <TableHead className="text-xs">가입일</TableHead>
                <TableHead className="text-xs w-[170px]">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...pendingUsers, ...approvedUsers].map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="text-sm font-medium">
                    {user.name}
                    {user.id === currentUser.id && (
                      <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">나</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <OrganizationPath userId={user.id} emptyLabel={user.approved ? '미지정' : '승인 전 지정 필요'} />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => openOrganizationDialog(user)}
                      >
                        조직 지정
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      onValueChange={(v) => handleRoleChange(user.id, v as UserRole)}
                      disabled={user.id === currentUser.id}
                    >
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin" className="text-xs">관리자</SelectItem>
                        <SelectItem value="pm" className="text-xs">PM</SelectItem>
                        <SelectItem value="member" className="text-xs">멤버</SelectItem>
                        <SelectItem value="guest" className="text-xs">게스트</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {user.role === 'admin' ? (
                      <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">승인</Badge>
                    ) : (
                      <button
                        onClick={() => handleApprovalToggle(user)}
                        className={`text-xs font-medium px-2 py-0.5 rounded-full border transition-colors ${
                          user.approved
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                            : 'bg-red-50 text-red-600 border-red-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                        }`}
                      >
                        {user.approved ? '승인' : '대기'}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString('ko-KR')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setResetError('')
                          setResetTarget(user)
                        }}
                        title={authMode === 'supabase' ? '임시 비밀번호 설정' : '비밀번호 초기화'}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-600"
                        onClick={() => handleDelete(user.id)}
                        disabled={user.id === currentUser.id}
                        title="사용자 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </main>

      {/* 사용자 추가 다이얼로그 */}
      <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">새 사용자 등록</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div>
              <label className="std-form-label">이름</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="이름" className="h-8 text-sm" autoFocus disabled={addLoading} />
            </div>
            <div>
              <label className="std-form-label">이메일</label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@example.com" className="h-8 text-sm" disabled={addLoading} />
            </div>
            <div>
              <label className="std-form-label">초기 비밀번호</label>
              <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="6자 이상" className="h-8 text-sm" disabled={addLoading} />
            </div>
            <div>
              <label className="std-form-label">역할</label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)} disabled={addLoading}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">관리자</SelectItem>
                  <SelectItem value="pm">PM (프로젝트 관리자)</SelectItem>
                  <SelectItem value="member">멤버</SelectItem>
                  <SelectItem value="guest">게스트</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {addError && (
              <p className="std-feedback-error">{addError}</p>
            )}
            {authMode === 'supabase' && (
              <p className="std-feedback-info">Supabase Auth로 사용자가 생성되며, 즉시 승인됩니다.</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAddUser(false)} disabled={addLoading}>취소</Button>
              <Button size="sm" onClick={handleAddUser} disabled={addLoading}>
                {addLoading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />등록 중...</> : '등록'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!orgTarget} onOpenChange={() => { setOrgTarget(null); setOrgDraft({}) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">사용자 조직 지정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
              <div className="text-sm font-semibold">{orgTarget?.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{orgTarget?.email}</div>
            </div>

            <OrganizationAssignmentForm value={orgDraft} onChange={setOrgDraft} />

            {orgTarget && !orgTarget.approved && (
              <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-md border border-amber-200/80">
                승인 대기 회원은 회사와 부서를 지정한 뒤 승인할 수 있습니다.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setOrgTarget(null)}>취소</Button>
              <Button
                size="sm"
                onClick={handleSaveUserOrganization}
                disabled={!orgDraft.companyId || !orgDraft.departmentId}
              >
                저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 비밀번호 초기화 다이얼로그 */}
      <Dialog open={!!resetTarget} onOpenChange={() => { setResetTarget(null); setResetError('') }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base">임시 비밀번호 설정</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <p className="text-sm text-muted-foreground">
              <strong>{resetTarget?.name}</strong> ({resetTarget?.email})
            </p>
            {authMode === 'supabase' && (
              <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-md border border-amber-200/80">
                저장한 값이 임시 비밀번호로 설정됩니다. 대상 사용자는 다음 로그인 직후 새 비밀번호를 다시 입력해야 합니다.
              </p>
            )}
            <div>
              <label className="std-form-label">임시 비밀번호</label>
              <Input value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} className="h-8 text-sm" disabled={resetLoading} />
            </div>
            {resetError && <p className="std-feedback-error">{resetError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setResetTarget(null)} disabled={resetLoading}>취소</Button>
              <Button
                size="sm"
                onClick={handleResetPassword}
                disabled={resetPassword.length < 6 || resetLoading}
              >
                {resetLoading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />설정 중...</> : '임시 비밀번호 설정'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
