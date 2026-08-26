'use client'

import { useCallback, useEffect, useState } from 'react'
import PageCard from '@/components/PageCard'
import StatsCard from '@/components/StatsCard'
import SelectField from '@/components/ui/SelectField'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Badge, Note, InfoDot } from '@/components/ui'
import { DataTable, type Column } from '@/components'
import { useToast } from '@/contexts/ToastContext'
import { productTypeLabel } from '@/lib/productTypes'

/**
 * 首頁推薦 feed 報表（內容抽成 Panel，因為「其他設定」頁也用同一份）（老闆 2026-08-22 階段二；2026-08-26 大改文案）
 *
 * 老闆 2026-08-26：「這頁面看似有用，但後台管理員有看沒有懂 —— feed 是什麼？
 * A/B 分到舊排序的 % 又是什麼？」全頁術語翻成人話，每張表旁邊講清楚在看什麼、
 * 每個桶挑什麼進來、數字要怎麼判讀。
 *
 * 順帶修掉一個沒人發現的問題：原本用 `<PageCard title="…">`，
 * 而 PageCard 的 props 展開到 div 上 —— `title` 變成 HTML 的 tooltip 屬性，
 * **區塊標題從來沒有顯示在畫面上**，滑鼠停住才看得到。改用 header。
 */
interface AbRow { id: string; variant: string; sessions: number; impressions: number; clicks: number; ctr: number | null; draw_sessions: number }
interface BucketRow { id: string; bucket: string; impressions: number; clicks: number; ctr: number | null }
interface TopRow { id: number; product_id: number; name: string; series: string | null; type: string; feed_boost: number; impressions: number; clicks: number; ctr: number | null }
interface TopicRow { id: string; keyword: string; weight: number; source: string }
interface Report { days: number; abRatio: number; ab: AbRow[]; buckets: BucketRow[]; top: TopRow[]; topics: TopicRow[] }

const BUCKET_LABEL: Record<string, string> = {
  forYou: '為你推薦', topic: '話題', hot: '熱賣', fresh: '新品／快完售', explore: '探索（隨機）', '-': '（無桶別）',
}

/** 每個桶挑什麼商品進來 —— 桶名本身看不出依據，直接寫在表上 */
const BUCKET_DESC: Record<string, string> = {
  forYou:  '玩家抽過的系列、關注的商品、這一趟點過看過的東西',
  hot:     '近期真的被抽得多的',
  fresh:   '剛上架，或籤快抽完的',
  topic:   '情報文章標籤＋玩家搜尋算出的熱詞（會濾掉「公仔」「轉蛋」這類沒鑑別度的字）',
  explore: '純隨機。保證每件商品都有機會被看到，不會被演算法永久埋掉',
  '-':     '舊資料沒有記桶別',
}

/** 登入與訪客的版位配額（lib/feed/assemble.ts 的 SLOTS_USER / SLOTS_GUEST） */
const SLOT_LAYOUT = {
  user:  '為你推薦 ×2、話題、熱賣、新品／快完售、探索',
  guest: '熱賣、為你推薦、話題、熱賣、新品／快完售、探索',
}

/** 點擊數太少時所有比率都會亂跳，先講在前面免得誤判 */
const MIN_CLICKS_FOR_SIGNAL = 100
const pct = (v: number | null | undefined) => (v == null ? '—' : `${(Number(v) * 100).toFixed(2)}%`)

export function FeedReportPanel() {
  const { toast } = useToast()
  const [days, setDays] = useState('7')
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [abRatio, setAbRatio] = useState('0')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/feed-report?days=${days}`, { credentials: 'include' })
      const json = (await res.json()) as Report & { error?: string }
      if (!res.ok) throw new Error(json.error || '讀取失敗')
      setData({
        ...json,
        ab: (json.ab ?? []).map(r => ({ ...r, id: r.variant })),
        buckets: (json.buckets ?? []).map(r => ({ ...r, id: r.bucket })),
        top: (json.top ?? []).map(r => ({ ...r, id: r.product_id })),
        topics: (json.topics ?? []).map(r => ({ ...r, id: r.keyword })),
      })
      setAbRatio(String(json.abRatio))
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }, [days, toast])

  useEffect(() => { void load() }, [load])

  const saveRatio = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/feed-report', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abRatio: Number(abRatio) }),
      })
      if (!res.ok) throw new Error('儲存失敗')
      toast('A/B 比例已更新（前台 5 分鐘內生效）')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const totals = (data?.ab ?? []).reduce((a, r) => ({ imp: a.imp + Number(r.impressions), clk: a.clk + Number(r.clicks), s: a.s + Number(r.sessions) }), { imp: 0, clk: 0, s: 0 })

  const abColumns: Column<AbRow>[] = [
    {
      key: 'variant', label: '排法',
      render: r => (
        <div>
          <Badge color={r.variant === 'v2' ? 'green' : 'gray'}>
            {r.variant === 'v2' ? '新 feed' : '舊排序（對照組）'}
          </Badge>
          <div className="mt-1 text-xs text-neutral-500">
            {r.variant === 'v2' ? '分桶配額＋加權抽籤' : '系列偏好分＋熱度，頭部固定'}
          </div>
        </div>
      ),
    },
    { key: 'sessions', label: 'Session', render: r => Number(r.sessions).toLocaleString() },
    { key: 'impressions', label: '曝光', render: r => Number(r.impressions).toLocaleString() },
    { key: 'clicks', label: '點擊', render: r => Number(r.clicks).toLocaleString() },
    { key: 'ctr', label: '點擊率', render: r => pct(r.ctr) },
    {
      key: 'draw_sessions', label: '帶出的抽獎',
      render: r => (
        <div>
          <span className="font-medium text-neutral-900">{Number(r.draw_sessions).toLocaleString()}</span>
          <span className="ml-1 text-xs text-neutral-500">
            / {Number(r.sessions).toLocaleString()} 次瀏覽
          </span>
        </div>
      ),
    },
  ]
  const bucketColumns: Column<BucketRow>[] = [
    {
      key: 'bucket', label: '版位',
      render: r => (
        <div>
          <div className="font-medium text-neutral-900">{BUCKET_LABEL[r.bucket] ?? r.bucket}</div>
          <div className="mt-0.5 max-w-md text-xs leading-relaxed text-neutral-500">
            {BUCKET_DESC[r.bucket] ?? ''}
          </div>
        </div>
      ),
    },
    { key: 'impressions', label: '曝光', render: r => Number(r.impressions).toLocaleString() },
    { key: 'clicks', label: '點擊', render: r => Number(r.clicks).toLocaleString() },
    { key: 'ctr', label: '點擊率', render: r => pct(r.ctr) },
  ]
  const topColumns: Column<TopRow>[] = [
    { key: 'name', label: '商品', render: r => <span className="font-medium">{r.name}</span> },
    { key: 'series', label: '系列', render: r => r.series || '—' },
    { key: 'type', label: '類別', render: r => productTypeLabel(r.type) },
    { key: 'feed_boost', label: '加權', render: r => (r.feed_boost > 0 ? <Badge color="orange">×{[1, 1.5, 2, 3][r.feed_boost]}</Badge> : '—') },
    { key: 'impressions', label: '曝光', render: r => Number(r.impressions).toLocaleString() },
    { key: 'clicks', label: '點擊', render: r => Number(r.clicks).toLocaleString() },
    { key: 'ctr', label: '點擊率', render: r => pct(r.ctr) },
  ]
  const topicColumns: Column<TopicRow>[] = [
    { key: 'keyword', label: '關鍵字' },
    { key: 'weight', label: '權重', render: r => Number(r.weight).toFixed(1) },
    { key: 'source', label: '來源', render: r => r.source.split('+').map(s => ({ news: '情報', search: '搜尋', tag: '標籤' }[s] ?? s)).join('＋') },
  ]

  const ratioNum = Number(abRatio) || 0
  const noControl = (data?.abRatio ?? 0) === 0
  const lowSample = totals.clk > 0 && totals.clk < MIN_CLICKS_FOR_SIGNAL

  return (
  <div className="space-y-4">
      {/* 這頁在看什麼 —— 不寫的話「feed」「桶」「變體」全是內部黑話 */}
      <Note>
        <span className="font-medium text-neutral-900">首頁「綜合 → 推薦」那一頁的商品順序，是每次刷新重新算的。</span>
        這張報表就是看那套算法有沒有推對東西。每 6 格分成幾個版位，各自從不同條件挑商品：
        登入玩家是「{SLOT_LAYOUT.user}」，訪客是「{SLOT_LAYOUT.guest}」。
      </Note>

      <PageCard>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <label className="block text-xs font-medium text-neutral-500 mb-1">統計區間</label>
            <SelectField value={days} onChange={e => setDays(e.target.value)}>
              <option value="1">近 1 天</option>
              <option value="7">近 7 天</option>
              <option value="14">近 14 天</option>
              <option value="30">近 30 天</option>
            </SelectField>
          </div>
          <div className="w-52">
            <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 mb-1">
              多少 % 玩家看舊排序
              <InfoDot>
                拿舊排法當對照組，比出新 feed 到底有沒有比較好。<br />
                <b>0</b>：全部玩家用新 feed（沒有對照組，比不出來）<br />
                <b>50</b>：一半看舊的、一半看新的 —— 兩週後比下面那張表<br />
                <b>100</b>：全部退回舊排序<br /><br />
                用瀏覽階段的編號決定分到哪一組，同一個人在同一趟瀏覽裡不會跳來跳去
                （不然刷新一次排法就換一套，數據會亂）。
              </InfoDot>
            </label>
            <Input type="number" min={0} max={100} value={abRatio} onChange={e => setAbRatio(e.target.value)} />
          </div>
          <Button onClick={saveRatio} isLoading={saving}>儲存比例</Button>
          <p className="text-xs text-neutral-400 basis-full">
            儲存後前台 5 分鐘內生效。以下數字都已排除機器人帳號；
            「曝光」是卡片有超過一半進到玩家畫面裡，同一趟瀏覽同一張卡只算一次。
          </p>
        </div>
      </PageCard>

      {noControl && ratioNum === 0 && (
        <Note tone="warn">
          目前是 <b>全部玩家都用新 feed</b>，沒有對照組 —— 下面的「兩種排法比較」只會有一行，
          看不出新 feed 比舊的好還是壞。想驗證的話把上面設成 <b>50</b>，跑兩週再回來看。
        </Note>
      )}

      {lowSample && (
        <Note tone="warn">
          這段期間只有 <b>{totals.clk}</b> 次點擊，樣本太小 ——
          多一次少一次點擊率就會跳好幾個百分點，先別根據這些比率下決定。
          累積到 {MIN_CLICKS_FOR_SIGNAL} 次以上再看趨勢。
        </Note>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatsCard title="瀏覽次數" value={totals.s.toLocaleString()} subtitle="不是人數，同一人開三次算三次" />
        <StatsCard title="商品曝光" value={totals.imp.toLocaleString()} subtitle="卡片被玩家看到的次數" />
        <StatsCard title="點進商品" value={totals.clk.toLocaleString()} subtitle="從推薦頁點進商品頁" />
        <StatsCard title="點擊率" value={totals.imp ? pct(totals.clk / totals.imp) : '—'} subtitle="點進商品 ÷ 商品曝光" />
      </div>

      <PageCard
        header={
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-neutral-900">
            兩種排法比較
            <InfoDot>
              只有把上面的比例設成 0 以外的數字，這裡才會有兩行可以比。<br /><br />
              <b>最該看「帶出的抽獎」那一欄</b> —— 點擊率高只代表圖好看、標題吸引人；
              從推薦點進去、30 分鐘內真的抽了，才叫推對東西。
            </InfoDot>
          </h2>
        }
      >
        <DataTable<AbRow> columns={abColumns} data={data?.ab ?? []} isLoading={loading} keyField="id" emptyMessage="還沒有資料" />
      </PageCard>

      <PageCard
        header={
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-neutral-900">
            各版位表現
            <InfoDot>
              哪一種挑法最會讓玩家想點。<br /><br />
              看的是<b>點擊率</b>不是曝光數 —— 曝光多只是配額給得多。
              某個版位長期墊底就該調它的配額，或檢討它挑商品的依據。
            </InfoDot>
          </h2>
        }
      >
        <DataTable<BucketRow> columns={bucketColumns} data={data?.buckets ?? []} isLoading={loading} keyField="id" emptyMessage="還沒有資料" />
      </PageCard>

      <PageCard
        header={
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-neutral-900">
            商品曝光排行（前 50）
            <InfoDot>
              「加權」是在商品管理裡手動設的推薦倍率（feed_boost 0~3）。<br />
              設了之後那件商品會被多推，但資料累積起來後系統會依實際點擊率自動稀釋，
              不會永遠霸榜。
            </InfoDot>
          </h2>
        }
      >
        <DataTable<TopRow> columns={topColumns} data={data?.top ?? []} isLoading={loading} keyField="id" emptyMessage="還沒有資料" />
      </PageCard>

      <PageCard
        header={
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-neutral-900">
            目前話題（近 7 天）
            <InfoDot>
              「話題」版位就是從這份清單挑商品。<br />
              來源是情報文章的標籤、玩家在站內搜尋的關鍵字，權重越高越常被拿來配對。
            </InfoDot>
          </h2>
        }
      >
        <DataTable<TopicRow> columns={topicColumns} data={data?.topics ?? []} isLoading={loading} keyField="id" emptyMessage="還沒有話題" />
      </PageCard>
  </div>
)
}
