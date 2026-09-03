'use client'

import { Suspense } from 'react'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTablePrefs } from '@/hooks/useTablePrefs'
import { formatDateTime } from '@/utils/dateFormat'
import { 
  AdminLayout, 
  StatsCard, 
  SearchToolbar, 
  DataTable, 
  PageCard,
  FilterTags,
  Modal,
  type Column,
  MemberNo
} from '@/components'
import DateRangePicker from '@/components/DateRangePicker'
import { supabase } from '@/lib/supabaseClient'
import SelectField from '@/components/ui/SelectField'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { ActionMenu, Tooltip } from '@/components/ui'
import { isSyntheticEmail } from '@/lib/syntheticEmail'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { useToast } from '@/contexts/ToastContext'

interface User {
  id: string
  userId: string
  /** 會員編號（給人看的短號）。列表顯示這個，uuid 只在會員詳情露出 */
  memberNo: number | null
  inviteCode: string | null
  name: string
  email: string
  phone: string
  tokens: number
  points: number
  registerDate: string
  lastLoginDate: string
  lastLoginIp: string
  status: 'active' | 'inactive'
  /* 帳號狀態。凍結已於 2026-08-31 併進停用（migration 660），只剩兩態 */
  accountStatus?: 'active' | 'inactive'
  isSuspicious?: boolean
  suspiciousReason?: string | null
  disabledReason?: string | null
  disabledBy?: string | null
  isBot: boolean
  totalOrders: number
  totalSpent: number
  totalDraws: number
  address?: string
}

interface CreateUserForm {
  name: string
  email: string
  password: string
  phone: string
  tokens: string
  status: 'active' | 'inactive'
  address: string
}

const EMPTY_CREATE_USER_FORM: CreateUserForm = {
  name: '',
  email: '',
  password: '',
  phone: '',
  tokens: '0',
  status: 'active',
  address: ''
}

export default function UsersPageWrapper() {
  return <Suspense><UsersPage /></Suspense>
}

function UsersPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [sortField, setSortField] = useState<string>(() => searchParams.get('sort') || 'registerDate')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() => (searchParams.get('dir') as 'asc' | 'desc') || 'desc')
  const [displayCount, setDisplayCount] = useState(20)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '')
  const [selectedStatus, setSelectedStatus] = useState(() => searchParams.get('status') || 'all')
  const [selectedUserType, setSelectedUserType] = useState(() => searchParams.get('type') || 'real')
  const [filterStartDate, setFilterStartDate] = useState(() => searchParams.get('startDate') || '')
  const [filterEndDate, setFilterEndDate] = useState(() => searchParams.get('endDate') || '')
  const { tableDensity, setTableDensity, visibleColumns, setVisibleColumns } = useTablePrefs('users', 'compact', {
    userId: true, inviteCode: true, name: true, email: true, phone: true,
    tokens: true, points: true, totalDraws: true, totalSpent: true,
    status: true, registerDate: true, lastLoginDate: true, lastLoginIp: true, operations: true
  })
  const [selectedUsers, setSelectedUsers] = useState<Set<number | string>>(new Set())

  // 同步篩選狀態到 URL，刷新後可恢復
  useEffect(() => {
    const params = new URLSearchParams()
    if (searchQuery) params.set('q', searchQuery)
    if (selectedStatus !== 'all') params.set('status', selectedStatus)
    if (selectedUserType !== 'real') params.set('type', selectedUserType)
    if (filterStartDate) params.set('startDate', filterStartDate)
    if (filterEndDate) params.set('endDate', filterEndDate)
    if (sortField !== 'registerDate') params.set('sort', sortField)
    if (sortDirection !== 'desc') params.set('dir', sortDirection)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchQuery, selectedStatus, selectedUserType, filterStartDate, filterEndDate, sortField, sortDirection, pathname])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // 使用集中的使用者資料
  const [users, setUsers] = useState<User[]>([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createUserForm, setCreateUserForm] = useState<CreateUserForm>(EMPTY_CREATE_USER_FORM)
  const [createUserError, setCreateUserError] = useState('')
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  
  // 使用者狀態管理（用於開關切換）
  const [userStatuses, setUserStatuses] = useState<{ [key: string]: 'active' | 'inactive' }>({})

  const { toast } = useToast()
  const { confirm, dialogProps } = useConfirmDialog()

  /*
   * 停用／凍結／標記可疑／手動補幣（老闆 2026-08-31 從會員詳情搬過來）。
   *
   * 搬過來的理由是動線：客服是「在列表找到人 → 處理」，為了停用一個帳號
   * 先點進詳情頁太繞。而且詳情頁那排大按鈕把「停用」跟「手動補幣」並排、
   * 顏色大小都差不多，按錯的代價差很多 —— 收進「⋯」之後要多一步才按得到。
   */
  const [rechargeUser, setRechargeUser] = useState<{ id: string; name: string } | null>(null)
  const [rechargeAmount, setRechargeAmount] = useState('')
  const [rechargeNote, setRechargeNote] = useState('')
  const [rechargeMethod, setRechargeMethod] = useState<'promotion' | 'compensation' | 'test' | 'correction'>('promotion')
  const [rechargeLoading, setRechargeLoading] = useState(false)

  /*
   * 停用／啟用。走 risk-action 而不是直接 PUT status（老闆 2026-08-31 合併凍結之後）。
   *
   * 那支會一併記下原因／時間／操作者、推 LINE 給管理員、並檢查這個帳號有沒有
   * 待處理的儲值（有的話寫 agent_events 給財務跟進）—— 那三樣本來是「凍結」
   * 才有的，凍結併掉之後停用全部接手。直接 PUT status 只會改欄位，什麼都不留。
   */
  const setMemberStatus = async (id: string, next: 'active' | 'inactive', reason?: string) => {
    const prevStatus = userStatuses[id]
    // 先動畫面再打 API，失敗就回滾 —— 列表操作要有立即回饋
    setUserStatuses(p => ({ ...p, [id]: next }))
    setUsers(p => p.map(u => u.id === id ? { ...u, status: next, accountStatus: next } : u))
    const res = await fetch(`/api/admin/users/${id}/risk-action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: next === 'active' ? 'enable' : 'disable', reason }),
    })
    if (!res.ok) {
      setUserStatuses(p => ({ ...p, [id]: prevStatus }))
      setUsers(p => p.map(u => u.id === id ? { ...u, status: prevStatus, accountStatus: prevStatus } : u))
      toast('更新失敗，請重試', 'error')
      return
    }
    setUsers(p => p.map(u => u.id === id ? { ...u, disabledReason: next === 'active' ? null : (reason ?? '後台操作') } : u))
    toast(next === 'active' ? '已啟用' : '已停用')
  }

  /** 停用要填原因；啟用只要確認。兩個入口（狀態開關與「⋯」）共用這一支 */
  const askToggleStatus = (u: User) => {
    const isOn = userStatuses[u.id] === 'active'
    if (!isOn) {
      confirm({
        title: '確認操作',
        message: `確定要啟用會員「${u.name}」嗎？啟用後就能正常登入。`,
        onConfirm: () => setMemberStatus(u.id, 'active'),
      })
      return
    }
    const reason = prompt(`停用「${u.name}」的原因（會記進稽核軌跡，也會顯示在會員列表）：`)
    // 按取消就什麼都不做；留空則記成「後台操作」
    if (reason === null) return
    setMemberStatus(u.id, 'inactive', reason.trim() || undefined)
  }

  /** 可疑標記。停用／啟用走 setMemberStatus（同一支 API，不同 action） */
  const riskAction = async (id: string, action: 'flag' | 'unflag', reason?: string) => {
    const res = await fetch(`/api/admin/users/${id}/risk-action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    })
    if (!res.ok) { toast('操作失敗，請重試', 'error'); return }
    setUsers(p => p.map(u => u.id !== id ? u : {
      ...u,
      isSuspicious: action === 'flag',
    }))
    toast(action === 'flag' ? '已標記可疑' : '已解除標記')
  }

  const doRecharge = async () => {
    if (!rechargeUser) return
    const amount = parseInt(rechargeAmount)
    const isCorrection = rechargeMethod === 'correction'
    if (!amount || (!isCorrection && amount <= 0)) { toast('請輸入有效金額', 'warning'); return }
    // 帳務更正可以是負數（扣回），但一定要寫原因 —— 事後查帳只剩這一句話可看
    if (isCorrection && !rechargeNote.trim()) { toast('帳務更正必須填寫原因', 'warning'); return }
    setRechargeLoading(true)
    try {
      const res = await fetch('/api/admin/recharges', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: rechargeUser.id, amount,
          payment_method: rechargeMethod, note: rechargeNote || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error || '儲值失敗', 'error'); return }
      setUsers(p => p.map(u => u.id === rechargeUser.id ? { ...u, tokens: Math.max(0, u.tokens + amount) } : u))
      toast(amount > 0 ? `已補 ${amount} G幣` : `已扣回 ${Math.abs(amount)} G幣`, 'success')
      setRechargeUser(null)
    } finally {
      setRechargeLoading(false)
    }
  }

  /*
   * 舊的 `?edit=<id>` 網址（書籤、舊連結）改成直接帶去會員詳情。
   * 編輯彈窗已移除 —— 詳情頁的「基本設置」就是完整的編輯表單。
   */
  useEffect(() => {
    const fromUrl = searchParams?.get('edit')
    if (fromUrl) router.replace(`/users/${fromUrl}`)
  }, [searchParams, router])

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) {
        console.error('Error fetching users:', await res.text())
        return
      }

      const data: User[] = await res.json()
      if (Array.isArray(data)) {
        setUsers(data)
        const statuses: { [key: string]: 'active' | 'inactive' } = {}
        data.forEach(user => {
          statuses[user.id] = user.status
        })
        setUserStatuses(statuses)
      }
    } catch (err) {
      console.error('Unexpected error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchUsers()
  }, [fetchUsers])

  const handleCreateUser = async () => {
    setCreateUserError('')
    setIsCreatingUser(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: createUserForm.name,
          email: createUserForm.email,
          password: createUserForm.password,
          phone: createUserForm.phone,
          tokens: createUserForm.tokens,
          status: createUserForm.status,
          address: createUserForm.address,
        })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCreateUserError(data?.error || '新增會員失敗')
        return
      }

      setIsCreateModalOpen(false)
      setCreateUserForm(EMPTY_CREATE_USER_FORM)
      await fetchUsers()
    } catch (err) {
      console.error('Failed to create user:', err)
      setCreateUserError('新增會員失敗')
    } finally {
      setIsCreatingUser(false)
    }
  }

  // 篩選處理
  const filteredUsers = useMemo(() => {
    let result = users

    // 用戶類型篩選
    if (selectedUserType === 'real') {
      result = result.filter(u => !u.isBot)
    } else if (selectedUserType === 'bot') {
      result = result.filter(u => u.isBot)
    }

    // 狀態篩選（使用實際的狀態）
    if (selectedStatus !== 'all') {
      result = result.filter(u => userStatuses[u.id] === selectedStatus)
    }

    // 搜尋篩選
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(u =>
        u.userId.includes(query) ||
        // 搜尋支援 100042 或 #100042 兩種打法
        (u.memberNo != null && String(u.memberNo).includes(query.replace(/^#/, ''))) ||
        (u.inviteCode && u.inviteCode.toLowerCase().includes(query)) ||
        u.name.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        u.phone.includes(query)
      )
    }

    // 註冊日期範圍篩選
    if (filterStartDate) {
      result = result.filter(u => {
        const registerDate = u.registerDate.split(' ')[0] // 取得日期部分 YYYY-MM-DD
        return registerDate >= filterStartDate
      })
    }
    if (filterEndDate) {
      result = result.filter(u => {
        const registerDate = u.registerDate.split(' ')[0]
        return registerDate <= filterEndDate
      })
    }

    return result
  }, [users, selectedStatus, selectedUserType, searchQuery, filterStartDate, filterEndDate])

  // 排序處理
  const sortedUsers = useMemo(() => {
    return [...filteredUsers].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortField) {
        case 'userId': aValue = a.userId; bValue = b.userId; break
        case 'name': aValue = a.name; bValue = b.name; break
        case 'email': aValue = a.email; bValue = b.email; break
        case 'phone': aValue = a.phone; bValue = b.phone; break
        case 'tokens': aValue = a.tokens; bValue = b.tokens; break
        case 'totalOrders': aValue = a.totalOrders; bValue = b.totalOrders; break
        case 'totalSpent': aValue = a.totalSpent; bValue = b.totalSpent; break
        case 'status': aValue = userStatuses[a.id] === 'active' ? 1 : 0; bValue = userStatuses[b.id] === 'active' ? 1 : 0; break
        case 'registerDate': aValue = new Date(a.registerDate).getTime(); bValue = new Date(b.registerDate).getTime(); break
        case 'lastLoginDate': aValue = new Date(a.lastLoginDate).getTime(); bValue = new Date(b.lastLoginDate).getTime(); break
        case 'lastLoginIp': aValue = new Date(a.lastLoginDate).getTime(); bValue = new Date(b.lastLoginDate).getTime(); break
        default: aValue = new Date(a.registerDate).getTime(); bValue = new Date(b.registerDate).getTime()
      }

      if (typeof aValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      } else {
        return sortDirection === 'asc' 
          ? aValue - bValue
          : bValue - aValue
      }
    })
  }, [filteredUsers, sortField, sortDirection, userStatuses])

  // 無限滾動處理
  const handleLoadMore = () => {
    if (isLoadingMore || displayCount >= sortedUsers.length) return
    setIsLoadingMore(true)
    setTimeout(() => {
      setDisplayCount(prev => Math.min(prev + 10, sortedUsers.length))
      setIsLoadingMore(false)
    }, 300)
  }

  // 當篩選條件改變時，重置顯示數量
  useEffect(() => {
    setDisplayCount(20)
  }, [sortField, sortDirection, searchQuery, selectedStatus, selectedUserType, filterStartDate, filterEndDate])

  // 匯出CSV功能
  const handleExportCSV = () => {
    // 獲取所有可見欄位的標題
    const visibleColumnsList = columns.filter(col => col.visible)
    const headers = visibleColumnsList.map(col => col.label)
    
    // 獲取所有資料（使用篩選後的資料）
    const csvData = sortedUsers.map(user => {
      return visibleColumnsList.map(col => {
        const value = user[col.key as keyof User]
        if (col.render) {
          // 如果有自定義渲染，需要提取實際值
          if (col.key === 'tokens') return user.tokens.toLocaleString()
          if (col.key === 'totalSpent') return user.totalSpent.toLocaleString()
          if (col.key === 'totalOrders') return user.totalOrders.toString()
          if (col.key === 'status') return userStatuses[user.id] === 'active' ? '啟用' : '停用'
          if (col.key === 'registerDate') return formatDateTime(user.registerDate)
          if (col.key === 'lastLoginDate') return formatDateTime(user.lastLoginDate)
          if (col.key === 'lastLoginIp') return user.lastLoginIp || ''
          return String(value || '')
        }
        if (col.key === 'status') {
          return userStatuses[user.id] === 'active' ? '啟用' : '停用'
        }
        if (col.key === 'registerDate') return formatDateTime(user.registerDate)
        if (col.key === 'lastLoginDate') return formatDateTime(user.lastLoginDate)
        if (col.key === 'lastLoginIp') return user.lastLoginIp || ''
        return String(value || '')
      })
    })
    
    // 組合CSV內容
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    // 添加BOM以支持中文
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `會員管理_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // 確認 Modal 狀態
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    variant: 'primary' | 'danger'
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'primary'
  })

  // 統計資料：只計算真實用戶（排除機器人）
  const realUsers = users.filter(u => !u.isBot)
  const botCount = users.filter(u => u.isBot).length
  const totalUsers = realUsers.length
  const activeUsers = realUsers.filter(u => userStatuses[u.id] === 'active').length
  const inactiveUsers = realUsers.filter(u => userStatuses[u.id] === 'inactive').length
  const totalTokens = realUsers.reduce((sum, u) => sum + u.tokens, 0)
  const totalSpent = realUsers.reduce((sum, u) => sum + u.totalSpent, 0)

  // 表格欄位定義
  const columns: Column<User>[] = [
    /* 會員編號與邀請碼對調（老闆 2026-08-31）：全站表格認的識別是會員編號，
       邀請碼是邀請功能的東西，不該站在第一欄 */
    {
      key: 'userId',
      label: '會員編號',
      sortable: true,
      visible: visibleColumns.userId,
      render: (user) => <MemberNo no={user.memberNo} uuid={user.userId} />
    },
    {
      key: 'name',
      label: '暱稱',
      sortable: true,
      visible: visibleColumns.name,
      /*
       * 風險標記跟在暱稱後面。左邊那條色邊只講「有事」，這裡講「什麼事」；
       * 原因掛在 title 上 —— 滑過去看得到，不佔欄寬。
       */
      render: (user) => (
        /* 標記放暱稱**左邊**（老闆 2026-08-31）：暱稱長度不一，標記跟在後面
           每一列的位置都不同，掃不出來；放左邊就會對齊成一直排 */
        <span className="inline-flex items-center gap-1.5">
          {/*
            懸停顯示「誰做的、為什麼」—— 標記只講「有事」，滑過去才知道是什麼事。
            用 Tooltip 不用 `title`：原生的要按住一秒多才出現、樣式不能改、手機沒有。
          */}
          {user.accountStatus === 'inactive' && (
            <Tooltip content={`操作者：${user.disabledBy || '未知'}\n說明：${user.disabledReason || '（未填寫）'}`}>
              <span className="inline-flex shrink-0 cursor-help rounded px-1.5 py-0.5 text-[11px] font-medium bg-red-100 text-red-700">
                停用
              </span>
            </Tooltip>
          )}
          {user.isSuspicious && (
            <Tooltip content={`說明：${user.suspiciousReason || '（未填寫）'}`}>
              <span className="inline-flex shrink-0 cursor-help rounded px-1.5 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-700">
                可疑
              </span>
            </Tooltip>
          )}
          <span>{user.name}</span>
        </span>
      ),
    },
    {
      key: 'email',
      label: '電子郵件',
      sortable: true,
      visible: visibleColumns.email,
      /*
       * LINE 登入的帳號沒有真信箱，系統填的是 `line_<32 位雜湊>@line-login.ggb.com.tw`，
       * 一整串把整欄撐到真信箱的兩倍寬（老闆 2026-09-04）。欄寬照真信箱抓，
       * 這種假信箱截斷加點點點，滑過去才看全文。真信箱不動。
       */
      render: (user) => isSyntheticEmail(user.email) ? (
        <Tooltip content={user.email}>
          <span className="inline-block max-w-[200px] truncate align-bottom cursor-help">{user.email}</span>
        </Tooltip>
      ) : user.email,
    },
    /* 電話欄移除（老闆 2026-08-31）：列表上一整欄號碼既佔寬度又是個資，
       要查號碼去會員詳情的「基本設置」看 —— 那裡本來就有，而且改得動 */
    {
      key: 'tokens',
      label: '代幣餘額(G)',
      sortable: true,
      visible: visibleColumns.tokens,
      className: 'text-right',
      render: (user) => <span className="font-mono whitespace-nowrap">{user.tokens.toLocaleString()}</span>
    },
    {
      key: 'points',
      label: '積分餘額(P)',
      sortable: true,
      visible: visibleColumns.points,
      className: 'text-right',
      render: (user) => <span className="font-mono whitespace-nowrap">{user.points?.toLocaleString() || '0'}</span>
    },
    {
      key: 'totalDraws',
      label: '抽獎數',
      sortable: true,
      visible: visibleColumns.totalDraws,
      className: 'text-right',
      render: (user) => <span className="font-mono whitespace-nowrap">{user.totalDraws}</span>
    },
    {
      key: 'totalSpent',
      label: '總消費(TWD)',
      sortable: true,
      visible: visibleColumns.totalSpent,
      className: 'text-right',
      render: (user) => <span className="font-mono whitespace-nowrap">{user.totalSpent.toLocaleString()}</span>
    },
    /*
     * 「狀態」欄移除（老闆 2026-08-31）：一顆開關擺在表格裡，滑鼠掃過去很容易誤觸，
     * 而停用會讓玩家當場被登出、再也登不進來 —— 那不該是隨手一點的操作。
     * 現在狀態看列上的紅底與暱稱旁的「停用」標記，要操作走「⋯」。
     */
    {
      key: 'registerDate',
      label: '註冊時間',
      sortable: true,
      visible: visibleColumns.registerDate,
      render: (user) => <span className="font-mono whitespace-nowrap">{formatDateTime(user.registerDate)}</span>
    },
    {
      key: 'lastLoginDate',
      label: '最後登入',
      sortable: true,
      visible: visibleColumns.lastLoginDate,
      render: (user) => <span className="font-mono whitespace-nowrap">{formatDateTime(user.lastLoginDate)}</span>
    },
    {
      key: 'lastLoginIp',
      label: '最後IP',
      sortable: true,
      visible: visibleColumns.lastLoginIp,
      render: (user) => <span className="font-mono whitespace-nowrap">{user.lastLoginIp || '-'}</span>
    },
    {
      key: 'inviteCode',
      label: '邀請碼',
      sortable: true,
      visible: visibleColumns.inviteCode,
      render: (user) => <span className="font-mono font-bold text-primary">{user.inviteCode || '-'}</span>
    },
    {
      key: 'operations',
      label: '操作',
      visible: visibleColumns.operations,
      sticky: true,
      /*
       * 主要動作留兩顆文字鈕，處置類收進「⋯」（跟配送管理同一套 ActionMenu）。
       *
       * 這四項原本在會員詳情頁最上面排成一整排大按鈕 —— 但客服的動線是
       * 「在列表找到人 → 處理」，為了停用一個帳號要先點進詳情頁太繞；
       * 而且那排按鈕裡「停用」跟「手動補幣」並排，兩個都是紅橘色系、
       * 大小一樣，按錯的代價差很多。
       */
      render: (user) => (
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/users/${user.id}`)}
            className="text-primary hover:text-primary text-sm font-medium whitespace-nowrap"
          >
            查看詳情
          </button>
          {/*
            「編輯」拿掉了（老闆 2026-08-31）。會員詳情的「基本設置」已經是完整的
            可編輯表單（暱稱／電話／性別／生日／頭像／收件資訊 ＋ 安全設置的密碼），
            欄位跟這個彈窗一模一樣 —— 兩個入口存的是同一批欄位，只會讓人不知道
            該用哪個，而且彈窗那版還讓 Email 可以改（users.email 改了不會同步
            Supabase Auth 的登入信箱，玩家會登不進來）。
          */}
          <ActionMenu items={[
            {
              label: '手動補幣',
              onClick: () => { setRechargeUser({ id: user.id, name: user.name }); setRechargeAmount(''); setRechargeNote(''); setRechargeMethod('promotion') },
            },
            {
              label: user.isSuspicious ? '解除可疑標記' : '標記可疑',
              onClick: () => {
                if (user.isSuspicious) {
                  confirm({ title: '確認操作', message: `解除「${user.name}」的可疑標記？`,
                    onConfirm: () => riskAction(user.id, 'unflag') })
                } else {
                  const reason = prompt('標記原因（可選）：')
                  if (reason !== null) riskAction(user.id, 'flag', reason || undefined)
                }
              },
            },
            {
              label: userStatuses[user.id] === 'active' ? '停用會員' : '啟用會員',
              danger: userStatuses[user.id] === 'active',
              // 停用會問原因（記進稽核軌跡、推 LINE、檢查待處理儲值）
              onClick: () => askToggleStatus(user),
            },
          ]} />
        </div>
      )
    }
  ]

  // 篩選標籤
  const filterTags = []
  if (selectedUserType !== 'all') {
    filterTags.push({
      key: 'userType',
      label: '用戶類型',
      value: selectedUserType === 'real' ? '真實用戶' : '機器人',
      color: 'primary' as const,
      onRemove: () => setSelectedUserType('all')
    })
  }
  if (selectedStatus !== 'all') {
    filterTags.push({
      key: 'status',
      label: '狀態',
      value: selectedStatus === 'active' ? '啟用' : '停用',
      color: 'primary' as const,
      onRemove: () => setSelectedStatus('all')
    })
  }

  return (
    <AdminLayout pageTitle="會員管理">
      <div className="space-y-6">
        {/* 統計卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard
            title="總會員數"
            value={totalUsers}
            onClick={() => setSelectedStatus('all')}
          />
          <StatsCard
            title="啟用會員"
            value={activeUsers}
            onClick={() => setSelectedStatus('active')}
            isActive={selectedStatus === 'active'}
            activeColor="primary"
          />
          <StatsCard
            title="停用會員"
            value={inactiveUsers}
            onClick={() => setSelectedStatus('inactive')}
            isActive={selectedStatus === 'inactive'}
            activeColor="primary"
          />
          <StatsCard
            title="總代幣餘額"
            value={totalTokens}
            unit="G"
          />
          <StatsCard
            title="總消費金額"
            value={totalSpent}
            unit="TWD"
          />
        </div>

        {/* 表格區域 */}
        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋ID、推薦碼、名稱、電子郵件..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showAddButton={true}
            addButtonText="+ 新增會員"
            onAddClick={() => {
              setCreateUserError('')
              setCreateUserForm(EMPTY_CREATE_USER_FORM)
              setIsCreateModalOpen(true)
            }}
            showExportCSV={true}
            onExportCSV={handleExportCSV}
            showDensity={true}
            density={tableDensity}
            onDensityChange={setTableDensity}
            showFilter={true}
            filterOptions={[
              {
                key: 'userType',
                label: '用戶類型',
                type: 'select',
                value: selectedUserType,
                onChange: setSelectedUserType,
                options: [
                  { value: 'all', label: `全部用戶` },
                  { value: 'real', label: '真實用戶' },
                  { value: 'bot', label: `機器人(${botCount})` }
                ]
              },
              {
                key: 'status',
                label: '狀態',
                type: 'select',
                value: selectedStatus,
                onChange: setSelectedStatus,
                options: [
                  { value: 'all', label: '全部狀態' },
                  { value: 'active', label: '啟用' },
                  { value: 'inactive', label: '停用' }
                ]
              },
              {
                key: 'registerDate',
                label: '註冊時間',
                type: 'date-range',
                startDate: filterStartDate,
                endDate: filterEndDate,
                render: () => (
                  <DateRangePicker
                    startDate={filterStartDate}
                    endDate={filterEndDate}
                    onStartDateChange={setFilterStartDate}
                    onEndDateChange={setFilterEndDate}
                    placeholder="選擇註冊時間範圍"
                  />
                )
              }
            ]}
            showColumnToggle={true}
            columns={[
              { key: 'userId', label: '會員編號', visible: visibleColumns.userId },
              { key: 'name', label: '暱稱', visible: visibleColumns.name },
              { key: 'email', label: '電子郵件', visible: visibleColumns.email },
              { key: 'tokens', label: '代幣餘額(G)', visible: visibleColumns.tokens },
              { key: 'points', label: '積分餘額(P)', visible: visibleColumns.points },
              { key: 'totalDraws', label: '抽獎數', visible: visibleColumns.totalDraws },
              { key: 'totalSpent', label: '總消費(TWD)', visible: visibleColumns.totalSpent },
              { key: 'registerDate', label: '註冊時間', visible: visibleColumns.registerDate },
              { key: 'lastLoginDate', label: '最後登入', visible: visibleColumns.lastLoginDate },
              { key: 'lastLoginIp', label: '最後IP', visible: visibleColumns.lastLoginIp },
              { key: 'inviteCode', label: '邀請碼', visible: visibleColumns.inviteCode },
              { key: 'operations', label: '操作', visible: visibleColumns.operations }
            ]}
            onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
            selectedCount={selectedUsers.size}
            batchActions={[
              { 
                label: '批量啟用', 
                onClick: () => {
                  if (selectedUsers.size === 0) return
                  setConfirmModal({
                    isOpen: true,
                    title: '批量啟用',
                    message: `確定要啟用選中的 ${selectedUsers.size} 個用戶嗎？`,
                    variant: 'primary',
                    onConfirm: async () => {
                      const selectedIds = Array.from(selectedUsers)
                      const newStatuses = { ...userStatuses }
                      const newUsers = users.map(user => {
                        if (selectedUsers.has(user.id)) {
                          newStatuses[user.id] = 'active'
                          return { ...user, status: 'active' as const }
                        }
                        return user
                      })
                      setUserStatuses(newStatuses)
                      setUsers(newUsers)
                      setSelectedUsers(new Set())
                      setConfirmModal(prev => ({ ...prev, isOpen: false }))
                      
                      try {
                        await Promise.all(selectedIds.map(id =>
                          fetch(`/api/admin/users/${id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ status: 'active' }),
                          })))
                      } catch (err) {
                        console.error('Error:', err)
                      }
                    }
                  })
                }, 
                variant: 'primary', 
                count: selectedUsers.size 
              },
              { 
                label: '批量停用', 
                onClick: () => {
                  if (selectedUsers.size === 0) return
                  setConfirmModal({
                    isOpen: true,
                    title: '批量停用',
                    message: `確定要停用選中的 ${selectedUsers.size} 個用戶嗎？`,
                    variant: 'danger',
                    onConfirm: async () => {
                      const selectedIds = Array.from(selectedUsers)
                      const newStatuses = { ...userStatuses }
                      const newUsers = users.map(user => {
                        if (selectedUsers.has(user.id)) {
                          newStatuses[user.id] = 'inactive'
                          return { ...user, status: 'inactive' as const }
                        }
                        return user
                      })
                      setUserStatuses(newStatuses)
                      setUsers(newUsers)
                      setSelectedUsers(new Set())
                      setConfirmModal(prev => ({ ...prev, isOpen: false }))
                      
                      try {
                        await Promise.all(selectedIds.map(id =>
                          fetch(`/api/admin/users/${id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ status: 'inactive' }),
                          })))
                      } catch (err) {
                        console.error('Error:', err)
                      }
                    }
                  })
                }, 
                variant: 'danger', 
                count: selectedUsers.size 
              }
            ]}
            onClearSelection={() => setSelectedUsers(new Set())}
          />

          <FilterTags
            tags={filterTags}
            onClearAll={() => { setSelectedStatus('all'); setSelectedUserType('all') }}
          />

          <DataTable
            data={sortedUsers}
            columns={columns}
            keyField="id"
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
            selectable={true}
            selectedIds={selectedUsers}
            onSelectChange={setSelectedUsers}
            density={tableDensity}
            /*
             * 風險狀態直接畫在列上（老闆 2026-08-31：標記可疑之後表格看不出來）。
             * 「狀態」欄移除之後，這條色邊就是唯一看得出停用的地方，更不能少。
             *
             * 左邊一條粗色邊 + 淡底色：粗邊在勾選框左側，一整頁掃下來一眼就看得到
             * 有幾個要注意的；淡底色是給只掃內容不看邊緣的人第二次機會。
             * 兩種都用而不是只用底色 —— 表格本身就有斑馬紋與 hover 底色，
             * 只靠底色會跟那些混在一起。
             *
             * 優先序：停用 > 可疑。停用是「進不來」，最該先看到；可疑只是內部註記。
             */
            rowClassName={(u: User) =>
              u.accountStatus === 'inactive'
                ? 'border-l-4 border-l-red-500 bg-red-50/60'
                : u.isSuspicious
                  ? 'border-l-4 border-l-amber-500 bg-amber-50/60'
                  : 'border-l-4 border-l-transparent'
            }
            enableInfiniteScroll={true}
            displayCount={displayCount}
            onLoadMore={handleLoadMore}
            isLoadingMore={isLoadingMore}
            totalCount={sortedUsers.length}
            visibleColumns={visibleColumns}
            emptyMessage="沒有找到符合條件的用戶"
            isLoading={isLoading}
          />
        </PageCard>
      </div>

      {/* 確認 Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        title={confirmModal.title}
      >
        <p className="text-neutral-700 mb-6">{confirmModal.message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            className="px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={confirmModal.onConfirm}
            className={`px-4 py-2 text-sm text-white rounded-lg transition-colors ${
              confirmModal.variant === 'danger'
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-primary hover:bg-primary-dark'
            }`}
          >
            確定
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          if (isCreatingUser) return
          setIsCreateModalOpen(false)
        }}
        title="新增會員"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">會員名稱</label>
            <input
              type="text"
              value={createUserForm.name}
              onChange={(e) => setCreateUserForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="請輸入會員名稱"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">電子郵件</label>
            <input
              type="email"
              value={createUserForm.email}
              onChange={(e) => setCreateUserForm(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="member@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">登入密碼</label>
            <input
              type="text"
              value={createUserForm.password}
              onChange={(e) => setCreateUserForm(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="至少 6 碼"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">電話</label>
              <input
                type="text"
                value={createUserForm.phone}
                onChange={(e) => setCreateUserForm(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="09xxxxxxxx"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">初始代幣</label>
              <input
                type="number"
                min="0"
                value={createUserForm.tokens}
                onChange={(e) => setCreateUserForm(prev => ({ ...prev, tokens: e.target.value }))}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">地址</label>
            <input
              type="text"
              value={createUserForm.address}
              onChange={(e) => setCreateUserForm(prev => ({ ...prev, address: e.target.value }))}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="選填"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">狀態</label>
            <SelectField
              value={createUserForm.status}
              onChange={(e) => setCreateUserForm(prev => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </SelectField>
          </div>
          {createUserError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {createUserError}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
              disabled={isCreatingUser}
            >
              取消
            </button>
            <button
              onClick={handleCreateUser}
              disabled={isCreatingUser}
              className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60"
            >
              {isCreatingUser ? '新增中...' : '建立會員'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 手動補幣。從會員詳情搬過來（老闆 2026-08-31），寫的是 recharge_records */}
      <Modal
        isOpen={!!rechargeUser}
        onClose={() => !rechargeLoading && setRechargeUser(null)}
        title={`手動補幣 — ${rechargeUser?.name ?? ''}`}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm text-neutral-600">類別</label>
            <SelectField value={rechargeMethod} onChange={e => setRechargeMethod(e.target.value as typeof rechargeMethod)}>
              <option value="promotion">行銷贈點</option>
              <option value="compensation">補償</option>
              <option value="test">測試</option>
              <option value="correction">帳務更正</option>
            </SelectField>
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">
              用戶儲值一律走綠界；銀行轉帳／現金／LINE Pay 手動入帳已停用。
              帳務更正可以填負數（扣回），其餘只能填正數。
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-neutral-600">金額 (G)</label>
            <Input type="number" value={rechargeAmount} onChange={e => setRechargeAmount(e.target.value)}
                   placeholder={rechargeMethod === 'correction' ? '可填負數' : '正整數'} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-neutral-600">
              原因{rechargeMethod === 'correction' && <span className="text-red-500"> *</span>}
            </label>
            <Input value={rechargeNote} onChange={e => setRechargeNote(e.target.value)}
                   placeholder="事後查帳只剩這一句話可看" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setRechargeUser(null)} disabled={rechargeLoading}>取消</Button>
            <Button onClick={doRecharge} isLoading={rechargeLoading}>確認</Button>
          </div>
        </div>
      </Modal>

      {dialogProps && <ConfirmDialog {...dialogProps} />}

    </AdminLayout>
  )
}
