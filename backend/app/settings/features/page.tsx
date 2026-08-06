'use client'

import { AdminLayout, PageCard } from '@/components'
import { useEffect, useState } from 'react'
import Textarea from '@/components/ui/Textarea'
import { useAdmin } from '@/contexts/AdminContext'
import ConfirmDialog from '@/components/ConfirmDialog'
import InfoDot from '@/components/ui/InfoDot'
import DateTimePicker from '@/components/DateTimePicker'
import { useToast } from '@/contexts/ToastContext'

type FeatureKey = 'sell' | 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom' | 'exchange' | 'market' | 'sell_escrow' | 'recharge'

type LinePushKey =
  | 'line_push_daily' | 'line_push_cfo' | 'line_push_cmo' | 'line_push_supply'
  | 'line_push_health' | 'line_push_market' | 'line_push_risk' | 'line_push_monitor'
  | 'line_push_finance' | 'line_push_deliver' | 'line_push_dormant' | 'line_push_recharge'
  | 'line_push_content' | 'line_push_cto'

// 說明只寫「推什麼」，不寫幾點推 —— 排程改在資料庫，寫死時間遲早會對不上
const LINE_PUSH_ITEMS: { key: LinePushKey; label: string; desc: string }[] = [
  { key: 'line_push_daily',    label: '每日早報',       desc: '當天待處理的事項總覽。' },
  { key: 'line_push_cfo',      label: 'CFO 財務對帳',   desc: '代幣對帳、收入趨勢與廠商月結。' },
  { key: 'line_push_cmo',      label: 'CMO 行銷日報',   desc: '行銷數據與跨部門的行動建議。' },
  { key: 'line_push_supply',   label: '供應鏈警示',     desc: '超時未出貨與零庫存的商品。' },
  { key: 'line_push_health',   label: '健康監測',       desc: '資料庫連線、金流錯誤率、尖峰時段零交易。' },
  { key: 'line_push_market',   label: '市場 / 競品情報', desc: '競品爬取與市場探索的分析結果。' },
  { key: 'line_push_risk',     label: '風控掃描',       desc: '異常帳號與可疑交易。' },
  { key: 'line_push_monitor',  label: '平台監測',       desc: '平台整體狀態的定時回報。' },
  { key: 'line_push_finance',  label: '對帳 / 月結',    desc: '綠界金流對帳與每月結算快照。' },
  { key: 'line_push_deliver',  label: '自動出貨通知',   desc: '自動出貨跑完的結果。' },
  { key: 'line_push_dormant',  label: '沉睡客喚回',     desc: '久未回訪的玩家名單。' },
  { key: 'line_push_recharge', label: '待審核儲值',     desc: '卡住沒完成的儲值單。' },
  { key: 'line_push_content',  label: 'AI 文案生成',    desc: 'AI 產出的行銷文案草稿。' },
  { key: 'line_push_cto',      label: 'AI CTO 報告',    desc: '技術面的定期巡檢。' },
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
  { key: 'commerce',    label: '金流' },
  { key: 'push',        label: 'GB哥通知' },
]

const CATEGORY_ITEMS: { key: FeatureKey; label: string; desc?: string }[] = [
  { key: 'ichiban',  label: '一番賞' },
  { key: 'blindbox', label: '盒玩' },
  { key: 'gacha',    label: '轉蛋' },
  { key: 'card',     label: '抽卡' },
  { key: 'custom',   label: '自製賞' },
  // 前面五個看名字就知道是什麼，販售不是 —— 它賣的是玩家的東西，不是平台的
  { key: 'sell',     label: '販售', desc: '玩家把抽到的獎品二手賣給其他玩家。收款方式在「金流」那一區設定。' },
]

const TRADE_ITEMS: { key: FeatureKey; label: string; desc: string }[] = [
  { key: 'exchange', label: '卡牌交換', desc: '玩家之間卡牌一對一交換。' },
  { key: 'market',   label: '交易所', desc: '玩家掛單買賣。' },
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
  // 交換與交易所也在「類別」那一區，一起算進摘要
  const categoryCounts = [...CATEGORY_ITEMS, ...TRADE_ITEMS].reduce(
    (acc, i) => {
      const st = states?.[i.key] ?? 'on'
      acc[st] += 1
      return acc
    },
    { on: 0, maintenance: 0, off: 0 } as Record<FlagState, number>,
  )

  const toggleFlag = (key: FeatureKey, checked: boolean) => {
    if (!flags) return
    const next = { ...flags, [key]: checked }
    setFlags(next)
    save({ flags: next })
  }

  const setState = (key: FeatureKey, v: FlagState, label: string) => {
    if (!states || states[key] === v) return
    const apply = () => {
      const next = { ...states, [key]: v }
      setStates(next)
      save({ states: next })
    }
    // 停掉儲值等於把金流斷開，跟關類別同一個量級，先問一次
    if (key === 'recharge' && v !== 'on') {
      setPendingAction({
        title: '讓儲值進入維護？',
        message: '玩家會無法儲值，綠界建單直接斷開，儲值頁顯示維護提示。已購買的代幣、抽獎與出貨都不受影響，出貨運費照樣付得了。',
        confirmText: '啟動維護',
        type: 'danger',
        run: apply,
      })
      return
    }
    // 關閉會讓前台整個入口消失（頁籤、商品、連結全部），
    // 影響比維護大得多，先問一次。維護是可恢復的，不問
    if (v === 'off') {
      setPendingAction({
        title: `關閉「${label}」？`,
        message: `前台會看不到${label}的入口與所有內容，直接開連結也只會看到「商品關閉中」。玩家已經抽到的獎品不受影響。若只是想暫停一下，請改選「維護」—— 入口會留著並說明稍後開放。`,
        confirmText: '確定關閉',
        type: 'danger',
        run: apply,
      })
      return
    }
    apply()
  }

  /*
   * 維護範圍前台與後台各一列。
   *
   * scope 那四個值本來就是兩個布林的組合（前台關不關 × 後台關不關），
   * 排成四顆按鈕等於逼讀者自己把組合拆回來。分成兩列之後，
   * 「我只想關前台」直接對應到「前台那一列選維護」。
   */
  const frontDown = maint?.scope === 'frontend' || maint?.scope === 'all'
  const backDown = maint?.scope === 'backend' || maint?.scope === 'all'
  const scopeOf = (f: boolean, b: boolean) => (f && b ? 'all' : f ? 'frontend' : b ? 'backend' : 'off')

  const requestMaint = (side: 'front' | 'back', down: boolean) => {
    if (!maint) return
    const nextScope = side === 'front' ? scopeOf(down, backDown) : scopeOf(frontDown, down)
    if (nextScope === maint.scope) return

    const label = side === 'front' ? '前台' : '後台'
    setPendingAction({
      title: down ? `讓${label}進入維護？` : `解除${label}維護？`,
      message: down
        ? side === 'front'
          ? '所有玩家會被帶到維護頁，正在瀏覽的人最多 30 秒內也會被帶走。'
          : '超級管理員以外的管理員會被擋在後台外面，而且只有超級管理員能解除。'
        : `${label}立即恢復正常，最多 30 秒內生效。`,
      confirmText: down ? '啟動維護' : '解除維護',
      type: down ? 'warning' : 'info',
      run: () => {
        // 開維護時若還沒設過時間就自動帶一個；兩邊都恢復時清掉，
        // 否則下次開維護會沿用上次那個早就過去的時間
        const until = nextScope === 'off' ? '' : (maint.until || defaultUntil())
        saveMaint({ scope: nextScope, message: maint.message, until })
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

  return (
    <AdminLayout pageTitle="功能開關">
      <div className="space-y-3">
        <SummaryBar
          ready={ready && Boolean(maint)}
          scope={maint?.scope ?? 'off'}
          rechargeOn={states?.recharge === 'on'}
          counts={categoryCounts}
        />

        {loadError && (
          <PageCard>
            <div className="text-sm text-neutral-700">
              讀取功能開關失敗，請重新整理（若仍失敗可能是登入狀態過期）
            </div>
          </PageCard>
        )}

        <PageCard>
          {/* 密度與字級照 Ant Design Pro 的個人設定頁：
              導覽項目 40 高、內容標題 20px、每列 14px 標題配 14px 灰色說明。
              後台其他頁面偏小偏粗，但這一頁的重點是看得懂，不是塞得多 */}
          <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
            {/* 分區導覽。手機上橫向捲動，桌機才靠左直排 */}
            <nav className="-mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:w-56 lg:flex-col lg:gap-0 lg:overflow-visible lg:border-r lg:border-neutral-100 lg:px-0 lg:pb-0 lg:pr-6">
              {SECTIONS.map(sc => {
                const active = section === sc.key
                return (
                  <button
                    key={sc.key}
                    type="button"
                    onClick={() => setSection(sc.key)}
                    className={`flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-4 text-left text-sm transition-colors lg:px-6 ${
                      active
                        ? 'bg-primary/5 font-medium text-primary'
                        : 'text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {sc.label}
                  </button>
                )
              })}
            </nav>

            <div className="min-w-0 flex-1">
              {section === 'maintenance' && (
                <>
                  <SectionHead
                    title="站台維護"
                    info="臨時性的開關，處理完就改回來。前台與後台分開設定 —— 維護的原因通常只影響一邊：改前台版面不必把後台鎖起來，而後台在改資料時前台反而更需要正常運作。"
                  />

                  <div className="divide-y divide-neutral-100">
                    <Row
                      title="前台"
                      desc="維護時玩家會被帶到維護頁，停在頁面上的人最多 30 秒內也會被帶走。這是最常用的那一個 —— 改前台版面時後台反而要留著能用。"
                      state={frontDown ? 'maintenance' : 'on'}
                    >
                      <Segmented
                        value={frontDown ? 'maintenance' : 'on'}
                        disabled={!maint || maintSaving}
                        options={[
                          { v: 'on', label: '開放', tone: 'on' },
                          { v: 'maintenance', label: '維護', tone: 'warn' },
                        ]}
                        onChange={(v) => requestMaint('front', v === 'maintenance')}
                      />
                    </Row>
                    <Row
                      title="後台"
                      desc={isSuperAdmin
                        ? '維護時超級管理員以外的管理員會被擋在外面。只有超級管理員能改這一項 —— 否則啟動之後就沒人能解除。'
                        : '只有超級管理員能改這一項。一般管理員關掉後台會把自己鎖在外面，而且沒辦法再進來解除。'}
                      state={backDown ? 'maintenance' : 'on'}
                    >
                      <Segmented
                        value={backDown ? 'maintenance' : 'on'}
                        disabled={!maint || maintSaving || !isSuperAdmin}
                        options={[
                          { v: 'on', label: '開放', tone: 'on' },
                          { v: 'maintenance', label: '維護', tone: 'warn' },
                        ]}
                        onChange={(v) => requestMaint('back', v === 'maintenance')}
                      />
                    </Row>
                  </div>

                  {maint && maint.scope !== 'off' && (
                    <div className="divide-y divide-neutral-100 border-t border-neutral-100">
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
                    info="決定前台提供哪些玩法與入口。開放是正常販售；維護會留著分類頁籤、點進去說明暫時維護中；關閉則是分類頁籤與商品全部從前台消失，直接開連結也只看到「商品關閉中」。三種狀態都不影響玩家已經抽到的獎品。"
                  />
                  <div className="divide-y divide-neutral-100">
                    {CATEGORY_ITEMS.map(item => (
                      <Row key={item.key} title={item.label} desc={item.desc} state={states?.[item.key] ?? 'on'}>
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
                    {TRADE_ITEMS.map(item => (
                      <Row key={item.key} title={item.label} desc={item.desc} state={states?.[item.key] ?? 'on'}>
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
                    title="金流"
                    info="錢怎麼走。已經完成的交易與已購買的代幣都不受這裡影響。"
                  />
                  <div className="divide-y divide-neutral-100">
                    {/* 販售收款這一列刻意不用開關：兩個選項都是具名的收款方式，
                        不是「開／關」。用開關的話關掉之後錢跑哪去就看不出來了 */}
                    <Row
                      // 販售類別不開的時候這個設定其實沒作用，在標題後面直接說 ——
                      // 不然改了半天不知道為什麼前台沒反應
                      title={
                        states?.sell === 'maintenance' ? '販售收款（販售維護中）'
                          : states?.sell === 'off' ? '販售收款（販售關閉中）'
                            : '販售收款'
                      }
                      desc={<>
                        平台代收：錢先由平台保管，賣家出貨、買家確認後才撥款，有糾紛平台介入得了。<br />
                        雙方自理：買家自己選轉帳或私下交易，平台不碰錢，也管不到糾紛。
                      </>}
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
                      desc="跟站台維護無關，可以單獨停。維護時綠界建單直接斷開，玩家在儲值頁看到維護提示；已購買的代幣、抽獎與出貨都不受影響，出貨運費照樣付得了。"
                      state={states?.recharge === 'on' ? 'on' : 'maintenance'}
                    >
                      {/* 儲值沒有「關閉」—— 平台不可能不收錢，只會臨時停一下。
                          多給一個永久關閉的選項只會讓人誤按 */}
                      <Segmented
                        value={states?.recharge === 'on' ? 'on' : 'maintenance'}
                        disabled={!ready || isSaving}
                        options={[
                          { v: 'on', label: '開放', tone: 'on' },
                          { v: 'maintenance', label: '維護', tone: 'warn' },
                        ]}
                        onChange={(v) => setState('recharge', v as FlagState, '儲值')}
                      />
                    </Row>
                  </div>
                </>
              )}

              {section === 'push' && (
                <>
                  <SectionHead
                    title="GB哥通知"
                    info="各個 AI 單位要不要把報告推到 LINE。只影響自己人，玩家完全無感 —— 關掉只是不推播，排程照常執行、報告照常寫進後台。"
                    // 計數與批次操作靠右對齊，跟下面那一排開關同一條線
                    right={
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-neutral-400 tabular-nums">
                          已開 {pushOnCount} / {LINE_PUSH_ITEMS.length}
                        </span>
                        <button
                          type="button"
                          disabled={isPushLoading || isPushSaving}
                          onClick={() => setAllPush(true)}
                          className="text-primary transition-colors hover:underline disabled:opacity-50"
                        >
                          全部開啟
                        </button>
                        <button
                          type="button"
                          disabled={isPushLoading || isPushSaving}
                          onClick={() => setAllPush(false)}
                          className="text-neutral-500 transition-colors hover:underline disabled:opacity-50"
                        >
                          全部關閉
                        </button>
                      </div>
                    }
                  />
                  <div className="divide-y divide-neutral-100">
                    {LINE_PUSH_ITEMS.map((item) => (
                      <Row key={item.key} title={item.label} desc={item.desc} state={pushFlags[item.key] ? 'on' : 'off'}>
                        <Segmented
                          value={pushFlags[item.key] ? 'on' : 'off'}
                          disabled={isPushLoading || isPushSaving}
                          options={[
                            { v: 'on', label: '開啟', tone: 'on' },
                            { v: 'off', label: '關閉', tone: 'off' },
                          ]}
                          onChange={(v) => {
                            const next = { ...pushFlags, [item.key]: v === 'on' }
                            setPushFlags(next)
                            savePush(next)
                          }}
                        />
                      </Row>
                    ))}
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
    { text: rechargeOn ? '儲值開放' : '儲值維護中', warn: !rechargeOn },
  ]
  if (counts.maintenance > 0) parts.push({ text: `${counts.maintenance} 項維護中`, warn: true })
  if (counts.off > 0) parts.push({ text: `${counts.off} 項已關閉`, warn: true })
  if (counts.maintenance === 0 && counts.off === 0) parts.push({ text: '類別全部開放', warn: false })

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-sm">
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
/**
 * 分區的標題。
 *
 * 說明收進標題旁的圓點，不鋪在畫面上 —— 分區層級的說明是「這一區在講什麼」，
 * 每次進來都讀一次沒有意義，但每一列自己的說明是操作前要看的，那個留在畫面上。
 */
function SectionHead({ title, info, right }: { title: string; info: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-medium text-neutral-900">
        {title}
        {/* 往下推 1px：中文字在行框裡本來就偏下，幾何置中會看起來偏上 */}
        <span className="inline-flex translate-y-px">
          <InfoDot>{info}</InfoDot>
        </span>
      </h2>
      {right}
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
  title: React.ReactNode
  desc?: React.ReactNode
  state?: FlagState
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {state && <span className={`h-2 w-2 shrink-0 rounded-full ${STATE_TONE[state]}`} />}
          <span className="text-sm text-neutral-900">{title}</span>
        </div>
        {desc && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-400">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/**
 * 分段按鈕。
 *
 * 全頁統一用它，不用 Switch。開關只表達得了「開」跟「不開」，
 * 講不出不開的時候是什麼 —— 類別是三態，販售收款的兩個選項是兩種收款方式，
 * 這些用開關根本表達不了。剩下的即使真的只有開/關，
 * 把字寫出來也比讓人從顏色推語意可靠，順便讓整頁只有一種控制項。
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
            className={`flex-1 whitespace-nowrap px-3.5 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? o.tone === 'on'
                  ? 'bg-primary font-medium text-white'
                  : o.tone === 'warn'
                    ? 'bg-amber-400 font-medium text-amber-950'
                    : 'bg-neutral-600 font-medium text-white'
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
