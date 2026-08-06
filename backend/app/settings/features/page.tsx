'use client'

import { AdminLayout, PageCard } from '@/components'
import { useEffect, useState } from 'react'
import Textarea from '@/components/ui/Textarea'
import { useAdmin } from '@/contexts/AdminContext'
import ConfirmDialog from '@/components/ConfirmDialog'
import DateTimePicker from '@/components/DateTimePicker'
import { useToast } from '@/contexts/ToastContext'

type FeatureKey = 'sell' | 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom' | 'exchange' | 'market' | 'sell_escrow' | 'recharge'

type LinePushKey =
  | 'line_push_daily' | 'line_push_cfo' | 'line_push_cmo' | 'line_push_supply'
  | 'line_push_health' | 'line_push_market' | 'line_push_risk' | 'line_push_monitor'
  | 'line_push_finance' | 'line_push_deliver' | 'line_push_dormant' | 'line_push_recharge'
  | 'line_push_content' | 'line_push_cto'

const LINE_PUSH_ITEMS: { key: LinePushKey; label: string }[] = [
  { key: 'line_push_daily',    label: '每日早報' },
  { key: 'line_push_cfo',      label: 'CFO 財務對帳' },
  { key: 'line_push_cmo',      label: 'CMO 行銷日報' },
  { key: 'line_push_supply',   label: '供應鏈警示' },
  { key: 'line_push_health',   label: '健康監測' },
  { key: 'line_push_market',   label: '市場 / 競品情報' },
  { key: 'line_push_risk',     label: '風控掃描' },
  { key: 'line_push_monitor',  label: '平台監測' },
  { key: 'line_push_finance',  label: '對帳 / 月結' },
  { key: 'line_push_deliver',  label: '自動出貨通知' },
  { key: 'line_push_dormant',  label: '沉睡客喚回' },
  { key: 'line_push_recharge', label: '待審核儲值' },
  { key: 'line_push_content',  label: 'AI 文案生成' },
  { key: 'line_push_cto',      label: 'AI CTO 報告' },
]

const DEFAULT_PUSH_FLAGS = LINE_PUSH_ITEMS.reduce((acc, { key }) => {
  acc[key] = true
  return acc
}, {} as Record<LinePushKey, boolean>)

/**
 * 類別的三態（migration 483）。
 *
 * 「關閉」跟「維護中」是兩件事：關閉是平台不做這個類別了，該完全消失；
 * 維護中是暫時停一下，該讓玩家看得到、知道會回來。用一個布林表達不出來。
 *
 * 只有 CATEGORY_KEYS 那六個吃三態 —— 玩家交易與 GB哥推播沒有「維護中」
 * 這個中間狀態可講，維持開/關就好。
 */
type FlagState = 'on' | 'maintenance' | 'off'

const STATE_OPTIONS: { v: FlagState; label: string }[] = [
  { v: 'on',          label: '開放' },
  { v: 'maintenance', label: '維護' },
  { v: 'off',         label: '關閉' },
]

type SectionKey = 'maintenance' | 'category' | 'commerce' | 'push'

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'maintenance', label: '站台維護' },
  { key: 'category',    label: '類別' },
  { key: 'commerce',    label: '交易與金流' },
  { key: 'push',        label: '內部通知' },
]

const CATEGORY_ITEMS: { key: FeatureKey; label: string }[] = [
  { key: 'ichiban',  label: '一番賞' },
  { key: 'blindbox', label: '盒玩' },
  { key: 'gacha',    label: '轉蛋' },
  { key: 'card',     label: '抽卡' },
  { key: 'custom',   label: '自製賞' },
  { key: 'sell',     label: '販售' },
]

const TRADE_ITEMS: { key: FeatureKey; label: string; desc: string }[] = [
  { key: 'exchange', label: '交換',   desc: '玩家之間卡牌一對一交換。跟交易所共用前台同一個入口，只能擇一。' },
  { key: 'market',   label: '交易所', desc: '玩家掛單買賣。跟交換共用前台同一個入口，只能擇一。' },
]

const DEFAULT_FLAGS: Record<FeatureKey, boolean> = {
  // 儲值預設開啟。關掉會直接斷開綠界建單（見 /api/payment/ecpay），
  // 玩家在儲值頁看到「儲值維護中」。已購買的代幣、抽獎與出貨都不受影響
  recharge: true,
  sell: true,
  ichiban: true,
  blindbox: true,
  gacha: true,
  card: true,
  custom: true,
  exchange: true,
  market: false,
  sell_escrow: false,
}

export default function FeatureFlagsPage() {
  const { toast } = useToast()
  const [flags, setFlags] = useState<Record<FeatureKey, boolean> | null>(null)
  const [states, setStates] = useState<Record<FeatureKey, FlagState> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const [pushFlags, setPushFlags] = useState<Record<LinePushKey, boolean>>(DEFAULT_PUSH_FLAGS)

  // 維護模式。前台與後台分開，因為維護的原因通常只影響一邊：
  // 改前台版面不必把後台鎖起來，而後台在改資料時前台反而更需要正常運作
  const [maint, setMaint] = useState<{ scope: string; message: string; until: string; bypassKey: string } | null>(null)
  const [maintSaving, setMaintSaving] = useState(false)
  /**
   * 需要先問過才做的操作。
   *
   * 一個 dialog 服務全部 —— 維護範圍、關閉類別、關閉儲值都會直接影響
   * 線上的玩家，共通點是「按下去外面就變了」，不該一鍵生效。
   * 反過來說，維護中的類別、玩家交易那幾個關掉影響有限，就不問，
   * 免得確認框多到沒人看。
   */
  const [pendingAction, setPendingAction] = useState<{
    title: string
    message: string
    confirmText: string
    type: 'danger' | 'warning' | 'info'
    run: () => void
  } | null>(null)
  const { user: adminUser } = useAdmin()
  const isSuperAdmin = adminUser?.role === 'super_admin' || adminUser?.role === 'superadmin'

  const ready = Boolean(flags) && !isLoading
  const pushOnCount = LINE_PUSH_ITEMS.filter(i => pushFlags[i.key]).length
  const categoryCounts = CATEGORY_ITEMS.reduce(
    (acc, i) => {
      const st = states?.[i.key] ?? 'on'
      acc[st] += 1
      return acc
    },
    { on: 0, maintenance: 0, off: 0 } as Record<FlagState, number>,
  )

  const toggleFlag = (key: FeatureKey, checked: boolean) => {
    if (!flags) return
    const apply = () => {
      const next = { ...flags, [key]: checked }
      setFlags(next)
      save({ flags: next })
    }
    // 關掉儲值等於把金流斷開，跟關類別同一個量級，先問一次
    if (key === 'recharge' && !checked) {
      setPendingAction({
        title: '關閉儲值？',
        message: '玩家會無法儲值，綠界建單直接斷開，儲值頁顯示維護提示。已購買的代幣、抽獎與出貨都不受影響，出貨運費照樣付得了。',
        confirmText: '關閉儲值',
        type: 'danger',
        run: apply,
      })
      return
    }
    apply()
  }

  const setState = (key: FeatureKey, v: FlagState, label: string) => {
    if (!states || states[key] === v) return
    const apply = () => {
      const next = { ...states, [key]: v }
      setStates(next)
      save({ states: next })
    }
    // 關閉類別會讓前台整個分類消失（頁籤、商品、連結全部），
    // 影響比維護大得多，先問一次。維護是可恢復的，不問
    if (v === 'off') {
      setPendingAction({
        title: `關閉「${label}」？`,
        message: `前台會看不到${label}的分類頁籤與所有商品，直接開連結也只會看到「商品關閉中」。玩家已經抽到的獎品不受影響。若只是想暫停一下，請改選「維護」—— 分類頁籤會留著並說明稍後開放。`,
        confirmText: '關閉類別',
        type: 'danger',
        run: apply,
      })
      return
    }
    apply()
  }

  // 已經是這個狀態就不用問；點自己不該有反應
  const requestScope = (v: string) => {
    if ((maint?.scope ?? 'off') === v) return
    setPendingAction({
      title: v === 'off' ? '解除維護模式？' : '啟動維護模式？',
      message:
        v === 'off'
          ? '解除後前台與後台立即恢復正常，最多 30 秒內全站生效。'
          : v === 'frontend'
            ? '所有玩家會被帶到維護頁，正在瀏覽的人最多 30 秒內也會被帶走。後台照常運作。'
            : v === 'backend'
              ? '超級管理員以外的管理員會被擋在後台外面。前台照常運作。'
              : '前台玩家與後台一般管理員都會被擋下來。只有超級管理員進得去。',
      confirmText: v === 'off' ? '解除維護' : '啟動維護',
      type: v === 'off' ? 'info' : 'warning',
      run: () => {
        // 開維護時若還沒設過時間就自動帶一個；解除時清掉，
        // 否則下次開維護會沿用上次那個早就過去的時間
        const until = v === 'off' ? '' : (maint?.until || defaultUntil())
        saveMaint({ scope: v, message: maint?.message ?? '', until })
      },
    })
  }

  const saveMaint = async (next: { scope: string; message: string; until: string }) => {
    setMaintSaving(true)
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(next),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '儲存失敗')
      setMaint(m => (m ? { ...m, ...next, bypassKey: json.bypassKey ?? m.bypassKey } : m))
    } catch {
      // 讀回真實狀態，不要讓畫面停在使用者以為成功的樣子
      fetch('/api/admin/maintenance', { credentials: 'include' })
        .then(r => r.json()).then(setMaint).catch(() => {})
    } finally {
      setMaintSaving(false)
    }
  }
  // 分區導覽。四個區塊分頁而不是一路往下捲 —— 每一列因此放得下一行說明，
  // 不必把解釋全收進 hover 圓點裡
  const [section, setSection] = useState<SectionKey>('maintenance')
  const [isPushLoading, setIsPushLoading] = useState(true)
  const [isPushSaving, setIsPushSaving] = useState(false)


  const load = async () => {
    setIsLoading(true)
    setLoadError(false)
    try {
      fetch('/api/admin/maintenance', { credentials: 'include', cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null)).then(d => { if (d) setMaint(d) }).catch(() => {})

      const res = await fetch('/api/admin/feature-flags', { method: 'GET', credentials: 'include', cache: 'no-store' })
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      if (!res.ok) throw new Error('load_failed')
      applyServerFlags(await res.json().catch(() => null))
    } catch {
      setLoadError(true)
      setFlags(null)
      setStates(null)
    } finally {
      setIsLoading(false)
    }
  }

  const loadPushFlags = async () => {
    setIsPushLoading(true)
    try {
      const res = await fetch('/api/admin/line-push-flags', { method: 'GET', credentials: 'include', cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json().catch(() => null)) as any
      const incoming = json?.flags || {}
      const next = { ...DEFAULT_PUSH_FLAGS }
      for (const k of Object.keys(next) as LinePushKey[]) {
        if (k in incoming) next[k] = Boolean(incoming[k])
      }
      setPushFlags(next)
    } catch {
      void 0
    } finally {
      setIsPushLoading(false)
    }
  }


  /**
   * 批次儲存推播開關。
   * 總開關一次要改十四項，逐項送出會變成十四個請求，
   * 而且每個都會 setState，互相覆蓋。API 本來就吃多筆，一次送完。
   */
  const setAllPush = (value: boolean) => {
    const next = LINE_PUSH_ITEMS.reduce((acc, { key }) => {
      acc[key] = value
      return acc
    }, {} as Record<LinePushKey, boolean>)
    setPushFlags(next)
    savePush(next)
  }

  const savePush = async (next: Record<LinePushKey, boolean>) => {
    setIsPushSaving(true)
    try {
      await fetch('/api/admin/line-push-flags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ flags: next }),
      })
    } finally {
      setIsPushSaving(false)
    }
  }


  useEffect(() => {
    const init = async () => {
      try {
        await fetch('/api/admin/feature-flags', { method: 'POST', credentials: 'include' })
      } catch {
        void 0
      }
      load()
      loadPushFlags()
    }
    init()
  }, [])

  /**
   * 存開關。伺服器回什麼就照什麼顯示 —— 交換與交易所是互斥的，
   * 開了一個另一個會被伺服器關掉，只信任本地的樂觀值會跟真實狀態對不上。
   *
   * 失敗時重新載入而不是留著使用者剛才那一下：原本的寫法是失敗也把
   * 樂觀值寫回去，畫面看起來成功、資料庫其實沒變，那比報錯更糟。
   */
  const save = async (payload: { flags?: Record<FeatureKey, boolean>; states?: Record<FeatureKey, FlagState> }) => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('save_failed')
      const json = (await res.json().catch(() => null)) as any
      applyServerFlags(json)
      toast('已更新')
    } catch {
      toast('儲存失敗，已還原成目前的實際設定', 'error')
      load()
    } finally {
      setIsSaving(false)
    }
  }

  /** 把 API 回來的 flags/states 寫進畫面。GET 與 PUT 的回應格式一樣，共用 */
  const applyServerFlags = (json: any) => {
    const incomingFlags = json?.flags || {}
    const incomingStates = json?.states || {}
    const nextFlags = { ...DEFAULT_FLAGS }
    const nextStates = {} as Record<FeatureKey, FlagState>
    for (const k of Object.keys(nextFlags) as FeatureKey[]) {
      if (k in incomingFlags) nextFlags[k] = Boolean(incomingFlags[k])
      nextStates[k] = (incomingStates[k] as FlagState) || (nextFlags[k] ? 'on' : 'off')
    }
    setFlags(nextFlags)
    setStates(nextStates)
  }


/**
 * DateTimePicker 用的是台灣時間的 'YYYY-MM-DD HH:mm:ss'，
 * 資料庫存的是 ISO（UTC）。兩邊格式不同，進出各轉一次。
 */
function isoToLocal(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`
}

function localToIso(local: string): string {
  if (!local) return ''
  const d = new Date(local.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/**
 * 啟動維護時預設的恢復時間：兩小時後，往後抓到最近的整點或半點。
 *
 * 給的是「大概什麼時候好」而不是精確秒數 —— 寫 15:00 玩家會等 15:00 回來看，
 * 寫 14:53 反而像是在承諾一個做不到的精度。抓整點/半點也讓維護視窗自然變寬一點，
 * 收工比預告時間早永遠比晚好。
 */
function defaultUntil(): string {
  const d = new Date()
  d.setHours(d.getHours() + 2)
  d.setSeconds(0, 0)
  // 0~29 分 → 30 分；30~59 分 → 下一個整點
  d.setMinutes(d.getMinutes() <= 30 ? 30 : 60)
  return d.toISOString()
}

// 繞過連結要指到這個環境自己的前台。寫死 www.ggb.com.tw 的話，
// 在 STG 複製出來的連結會把人帶去正式站，測不到剛才關的那個維護
const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://www.ggb.com.tw'

const MAINT_OPTIONS = [
  { v: 'off',      label: '正常營運',   hint: '兩邊都開放',                         adminOnly: false },
  { v: 'frontend', label: '只關前台',   hint: '玩家看維護頁，後台照常（最常用）',   adminOnly: false },
  { v: 'backend',  label: '只關後台',   hint: '前台照常，一般管理員擋在外面',       adminOnly: true  },
  { v: 'all',      label: '前後台都關', hint: '全站停機',                           adminOnly: true  },
] as const

  return (
    <AdminLayout pageTitle="功能開關">
      <div className="space-y-3">
        <SummaryBar
          ready={ready && Boolean(maint)}
          scope={maint?.scope ?? 'off'}
          rechargeOn={Boolean(flags?.recharge)}
          counts={categoryCounts}
        />

        {loadError && (
          <PageCard>
            <div className="text-sm font-bold text-neutral-700">
              讀取功能開關失敗，請重新整理（若仍失敗可能是登入狀態過期）
            </div>
          </PageCard>
        )}

        <PageCard>
          <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
            {/* 分區導覽。手機上橫向捲動，桌機才靠左直排 */}
            <nav className="-mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:w-40 lg:flex-col lg:overflow-visible lg:border-r lg:border-neutral-100 lg:px-0 lg:pb-0 lg:pr-4">
              {SECTIONS.map(sc => {
                const active = section === sc.key
                // 這一區有沒有非預設的設定。不用點進去就知道哪裡動過
                const flagged =
                  sc.key === 'maintenance' ? (maint?.scope ?? 'off') !== 'off'
                    : sc.key === 'category' ? categoryCounts.maintenance + categoryCounts.off > 0
                      : sc.key === 'commerce' ? flags?.recharge === false
                        : false
                return (
                  <button
                    key={sc.key}
                    type="button"
                    onClick={() => setSection(sc.key)}
                    className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-[13px] font-bold transition-colors ${
                      active
                        ? 'bg-primary/5 text-primary'
                        : 'text-neutral-500 hover:bg-neutral-50'
                    }`}
                  >
                    {sc.label}
                    {flagged && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
                  </button>
                )
              })}
            </nav>

            <div className="min-w-0 flex-1">
              {section === 'maintenance' && (
                <>
                  <SectionHead
                    title="站台維護"
                    desc="臨時性的開關，處理完就改回來。前台維護時玩家會被帶到維護頁，停在頁面上的人最多 30 秒內也會被帶走；後台維護只擋一般管理員，超級管理員照常進得去 —— 否則啟動之後就沒人能解除。"
                  />

                  {/* 正常營運佔一半寬：那是預設狀態，也是最常按回來的那顆 */}
                  <div className="flex flex-col gap-1.5 sm:flex-row">
                    {MAINT_OPTIONS.map(o => {
                      const active = (maint?.scope ?? 'off') === o.v
                      const blocked = o.adminOnly && !isSuperAdmin
                      return (
                        <button
                          key={o.v}
                          type="button"
                          disabled={!maint || maintSaving || blocked}
                          onClick={() => requestScope(o.v)}
                          title={blocked ? '僅超級管理員可以關閉後台' : undefined}
                          className={`flex min-h-[42px] items-center justify-center rounded-xl border px-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            o.v === 'off' ? 'sm:flex-[3]' : 'sm:flex-1'
                          } ${
                            active
                              ? o.v === 'off'
                                ? 'border-primary bg-primary/5 text-primary'
                                : 'border-amber-400 bg-amber-50 text-amber-900'
                              : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                          }`}
                        >
                          {o.label}
                        </button>
                      )
                    })}
                  </div>
                  {/* 說明只講「現在選的這個」是什麼意思，四個一起列會變成一堵字 */}
                  <p className="mt-2 text-xs font-bold text-neutral-400">
                    {MAINT_OPTIONS.find(o => o.v === (maint?.scope ?? 'off'))?.hint}
                  </p>

                  {maint && maint.scope !== 'off' && (
                    <div className="mt-5 space-y-4 border-t border-neutral-100 pt-5">
                      <Row title="玩家看到的訊息" desc="維護頁上那段話。留白會用預設文案。">
                        <div className="w-full sm:w-80">
                          <Textarea
                            rows={2}
                            value={maint.message}
                            onChange={e => setMaint({ ...maint, message: e.target.value })}
                            onBlur={() => saveMaint({ scope: maint.scope, message: maint.message, until: maint.until })}
                            placeholder="系統維護中，我們正在做一些調整，很快就回來。"
                          />
                        </div>
                      </Row>
                      <Row title="預計恢復時間" desc="啟動時自動帶兩小時後的整點或半點，顯示在維護頁上。">
                        <div className="w-full sm:w-52">
                          {/* 用站上的 DateTimePicker，不要生原生 datetime-local ——
                              原生的只有點右邊那顆小圖示才展開，跟其他頁面的操作方式不一致。
                              它收的是 'YYYY-MM-DD HH:mm:ss'，資料庫存的是 ISO，兩邊要轉 */}
                          <DateTimePicker
                            value={isoToLocal(maint.until)}
                            placeholder="選擇時間"
                            onChange={(v) => {
                              const next = { ...maint, until: localToIso(v) }
                              setMaint(next)
                              saveMaint({ scope: next.scope, message: next.message, until: next.until })
                            }}
                          />
                        </div>
                      </Row>
                      <Row
                        title="自己進去驗證的連結"
                        desc="開一次就種 8 小時的通行 cookie，之後照常瀏覽。每次重新啟動維護都會換新金鑰，上次發出去的連結會失效。"
                      >
                        <code className="block break-all rounded-lg bg-neutral-50 px-2.5 py-1.5 font-mono text-xs text-neutral-700">
                          {`${FRONTEND_URL}/?__mk=${maint.bypassKey}`}
                        </code>
                      </Row>
                    </div>
                  )}
                </>
              )}

              {section === 'category' && (
                <>
                  <SectionHead
                    title="類別"
                    desc="決定前台提供哪些玩法。開放是正常販售；維護會留著分類頁籤、點進去說明暫時維護中；關閉則是分類頁籤與商品全部從前台消失，直接開連結也只看到「商品關閉中」。三種狀態都不影響玩家已經抽到的獎品。"
                  />
                  <div className="divide-y divide-neutral-100">
                    {CATEGORY_ITEMS.map(item => (
                      <Row key={item.key} title={item.label} state={states?.[item.key] ?? 'on'}>
                        <Segmented
                          value={states?.[item.key] ?? 'on'}
                          disabled={!ready || isSaving}
                          options={[
                            { v: 'on', label: '開放', tone: 'on' },
                            { v: 'maintenance', label: '維護', tone: 'warn' },
                            { v: 'off', label: '關閉', tone: 'off' },
                          ]}
                          onChange={(v) => setState(item.key, v as FlagState, item.label)}
                        />
                      </Row>
                    ))}
                  </div>
                </>
              )}

              {section === 'commerce' && (
                <>
                  <SectionHead
                    title="交易與金流"
                    desc="玩家之間的交易入口，以及錢怎麼走。關掉之後前台不再顯示入口，進行中的交易不受影響。"
                  />
                  <div className="divide-y divide-neutral-100">
                    {TRADE_ITEMS.map(item => {
                      const on = Boolean(flags?.[item.key])
                      return (
                        <Row key={item.key} title={item.label} desc={item.desc} state={on ? 'on' : 'off'}>
                          <Segmented
                            value={on ? 'on' : 'off'}
                            disabled={!ready || isSaving}
                            options={[
                              { v: 'on', label: '開放', tone: 'on' },
                              { v: 'off', label: '關閉', tone: 'off' },
                            ]}
                            onChange={(v) => toggleFlag(item.key, v === 'on')}
                          />
                        </Row>
                      )
                    })}
                    {/* 販售收款不是開關，是「錢經不經過平台」的二選一。
                        原本叫「販售金流／開放·關閉」，讀者看不出關掉之後錢跑哪去 */}
                    <Row
                      title="販售收款"
                      desc="平台代收：錢先由平台保管，賣家出貨、買家確認後才撥款，有糾紛平台介入得了。雙方自理：買家自己選轉帳或私下交易，平台不碰錢，也管不到糾紛。"
                      state={flags?.sell_escrow ? 'on' : 'off'}
                    >
                      <Segmented
                        value={flags?.sell_escrow ? 'on' : 'off'}
                        disabled={!ready || isSaving}
                        options={[
                          { v: 'on', label: '平台代收', tone: 'on' },
                          { v: 'off', label: '雙方自理', tone: 'off' },
                        ]}
                        onChange={(v) => toggleFlag('sell_escrow', v === 'on')}
                      />
                    </Row>
                    <Row
                      title="儲值"
                      desc="跟站台維護無關，可以單獨關。關掉會直接斷開綠界建單，玩家在儲值頁看到維護提示；已購買的代幣、抽獎與出貨都不受影響，出貨運費照樣付得了。"
                      state={flags?.recharge === false ? 'off' : 'on'}
                    >
                      <Segmented
                        value={flags?.recharge === false ? 'off' : 'on'}
                        disabled={!ready || isSaving}
                        options={[
                          { v: 'on', label: '開放', tone: 'on' },
                          { v: 'off', label: '關閉', tone: 'off' },
                        ]}
                        onChange={(v) => toggleFlag('recharge', v === 'on')}
                      />
                    </Row>
                  </div>
                </>
              )}

              {section === 'push' && (
                <>
                  <SectionHead
                    title="內部通知"
                    desc="各個 AI 單位要不要把報告推到 LINE。只影響自己人，玩家完全無感 —— 關掉只是不推播，排程照常執行、報告照常寫進後台。"
                  />
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-400 tabular-nums">
                      已開 {pushOnCount} / {LINE_PUSH_ITEMS.length}
                    </span>
                    <span className="text-neutral-200">|</span>
                    <button
                      type="button"
                      disabled={isPushLoading || isPushSaving}
                      onClick={() => setAllPush(true)}
                      className="text-xs font-bold text-primary transition-colors hover:underline disabled:opacity-50"
                    >
                      全部開啟
                    </button>
                    <button
                      type="button"
                      disabled={isPushLoading || isPushSaving}
                      onClick={() => setAllPush(false)}
                      className="text-xs font-bold text-neutral-500 transition-colors hover:underline disabled:opacity-50"
                    >
                      全部關閉
                    </button>
                  </div>
                  {/* 十四項用標籤而不是一列一個控制項：這裡每一項都是同一種東西、
                      也不影響玩家，不值得各佔一整列。點一下就切換，實心是開、空心是關 */}
                  <div className="flex flex-wrap gap-2">
                    {LINE_PUSH_ITEMS.map((item) => {
                      const on = pushFlags[item.key]
                      return (
                        <button
                          key={item.key}
                          type="button"
                          disabled={isPushLoading || isPushSaving}
                          onClick={() => {
                            const next = { ...pushFlags, [item.key]: !on }
                            setPushFlags(next)
                            savePush(next)
                          }}
                          className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            on
                              ? 'border-primary bg-primary text-white'
                              : 'border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300'
                          }`}
                        >
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </PageCard>
      </div>

      <ConfirmDialog
        isOpen={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        onConfirm={() => {
          pendingAction?.run()
          setPendingAction(null)
        }}
        title={pendingAction?.title ?? ''}
        message={pendingAction?.message ?? ''}
        confirmText={pendingAction?.confirmText ?? '確定'}
        type={pendingAction?.type ?? 'info'}
      />
    </AdminLayout>
  )
}

const STATE_TONE: Record<FlagState, string> = {
  on: 'bg-green-500',
  maintenance: 'bg-amber-400',
  off: 'bg-neutral-300',
}

/**
 * 頂部狀態摘要。
 *
 * 分區之後看不到全貌，這一行補回來：進這頁最想先知道的是「現在整體正不正常」。
 * 異常的項目標琥珀色，正常的時候它安靜到不佔注意力。
 */
function SummaryBar({ ready, scope, rechargeOn, counts }: {
  ready: boolean
  scope: string
  rechargeOn: boolean
  counts: Record<FlagState, number>
}) {
  if (!ready) return null

  const scopeText =
    scope === 'off' ? '營運正常'
      : scope === 'frontend' ? '前台維護中'
        : scope === 'backend' ? '後台維護中'
          : '全站維護中'

  const parts: { text: string; warn: boolean }[] = [
    { text: scopeText, warn: scope !== 'off' },
    { text: rechargeOn ? '儲值開放' : '儲值已關閉', warn: !rechargeOn },
  ]
  if (counts.maintenance > 0) parts.push({ text: `${counts.maintenance} 個類別維護中`, warn: true })
  if (counts.off > 0) parts.push({ text: `${counts.off} 個類別已關閉`, warn: true })
  if (counts.maintenance === 0 && counts.off === 0) parts.push({ text: '類別全部開放', warn: false })

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[13px] font-bold">
      {parts.map((p, i) => (
        <span key={p.text} className="flex items-center gap-2">
          {i > 0 && <span className="text-neutral-300">·</span>}
          <span className={p.warn ? 'text-amber-600' : 'text-neutral-500'}>{p.text}</span>
        </span>
      ))}
    </div>
  )
}

/** 分區的標題與說明。說明直接寫在畫面上，不收進 hover —— 這一頁的重點就是看得懂 */
function SectionHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-black text-neutral-900">{title}</h2>
      <p className="mt-1 max-w-2xl text-xs font-bold leading-relaxed text-neutral-400">{desc}</p>
    </div>
  )
}

/**
 * 一列設定：左邊名稱與說明，右邊控制項。
 *
 * 說明放得下一整句，所以不必再用 hover 圓點 —— 要滑過去才看得到的說明，
 * 等於沒寫給不知道要滑的人看。
 * state 給了就在名稱前面點一個狀態圓點，不讀字也掃得出哪一列不是開放。
 */
function Row({ title, desc, state, children }: {
  title: string
  desc?: string
  state?: FlagState
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {state && <span className={`h-2 w-2 shrink-0 rounded-full ${STATE_TONE[state]}`} />}
          <span className="text-[13px] font-black text-neutral-900">{title}</span>
        </div>
        {desc && <p className="mt-0.5 max-w-xl text-xs font-bold leading-relaxed text-neutral-400">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/**
 * 分段按鈕。
 *
 * 全頁的「會影響玩家的設定」統一用它，不用開關 —— 開關只表達得了開/關，
 * 類別是三態；而且一頁上開關、三段按鈕混用，讀者要分辨兩套語言。
 * 只有內部通知那十四項還是點擊式標籤：那是量大又不影響玩家的東西，
 * 控制項的份量該跟設定的份量相稱。
 */
function Segmented({ value, options, disabled, onChange, className = '' }: {
  value: string
  options: { v: string; label: string; tone: 'on' | 'warn' | 'off' }[]
  disabled: boolean
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <div className={`flex w-fit shrink-0 divide-x divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 ${className}`}>
      {options.map(o => {
        const active = value === o.v
        return (
          <button
            key={o.v}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className={`flex-1 whitespace-nowrap px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? o.tone === 'on'
                  ? 'bg-primary text-white'
                  : o.tone === 'warn'
                    ? 'bg-amber-400 text-amber-950'
                    : 'bg-neutral-600 text-white'
                : 'bg-white text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
