'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import PageCard from '@/components/PageCard'
import StatsCard from '@/components/StatsCard'
import SelectField from '@/components/ui/SelectField'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui'
import { DataTable, type Column } from '@/components'
import { useToast } from '@/contexts/ToastContext'

/**
 * 首頁推薦 feed 報表（老闆 2026-08-22 階段二）。
 * 看：A/B 變體（v1 舊排序／v2 新 feed）、各桶的曝光／點擊率、商品排行、目前話題；
 * 調：A/B 比例（分到舊排序的百分比，0 = 全部新 feed）。資料來源見 /api/admin/feed-report。
 */
interface AbRow { id: string; variant: string; sessions: number; impressions: number; clicks: number; ctr: number | null; draw_sessions: number }
interface BucketRow { id: string; bucket: string; impressions: number; clicks: number; ctr: number | null }
interface TopRow { id: number; product_id: number; name: string; series: string | null; type: string; feed_boost: number; impressions: number; clicks: number; ctr: number | null }
interface TopicRow { id: string; keyword: string; weight: number; source: string }
interface Report { days: number; abRatio: number; ab: AbRow[]; buckets: BucketRow[]; top: TopRow[]; topics: TopicRow[] }

const BUCKET_LABEL: Record<string, string> = {
  forYou: '為你推薦', topic: '話題', hot: '熱賣', fresh: '新品／快完售', explore: '探索（隨機）', '-': '（無桶別）',
}
const pct = (v: number | null | undefined) => (v == null ? '—' : `${(Number(v) * 100).toFixed(2)}%`)

export default function FeedReportPage() {
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
    { key: 'variant', label: '變體', render: r => <Badge color={r.variant === 'v2' ? 'green' : 'gray'}>{r.variant === 'v2' ? 'v2 新 feed' : 'v1 舊排序'}</Badge> },
    { key: 'sessions', label: 'Session', render: r => Number(r.sessions).toLocaleString() },
    { key: 'impressions', label: '曝光', render: r => Number(r.impressions).toLocaleString() },
    { key: 'clicks', label: '點擊', render: r => Number(r.clicks).toLocaleString() },
    { key: 'ctr', label: '點擊率', render: r => pct(r.ctr) },
    { key: 'draw_sessions', label: '點擊後 30 分內抽獎的 Session', render: r => Number(r.draw_sessions).toLocaleString() },
  ]
  const bucketColumns: Column<BucketRow>[] = [
    { key: 'bucket', label: '桶', render: r => BUCKET_LABEL[r.bucket] ?? r.bucket },
    { key: 'impressions', label: '曝光', render: r => Number(r.impressions).toLocaleString() },
    { key: 'clicks', label: '點擊', render: r => Number(r.clicks).toLocaleString() },
    { key: 'ctr', label: '點擊率', render: r => pct(r.ctr) },
  ]
  const topColumns: Column<TopRow>[] = [
    { key: 'name', label: '商品', render: r => <span className="font-medium">{r.name}</span> },
    { key: 'series', label: '系列', render: r => r.series || '—' },
    { key: 'type', label: '類型', render: r => r.type },
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

  return (
    <AdminLayout pageTitle="推薦 feed 報表">
      <div className="space-y-4">
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
            <div className="w-44">
              <label className="block text-xs font-medium text-neutral-500 mb-1">A/B：分到舊排序的 %</label>
              <Input type="number" min={0} max={100} value={abRatio} onChange={e => setAbRatio(e.target.value)} />
            </div>
            <Button onClick={saveRatio} isLoading={saving}>儲存比例</Button>
            <p className="text-xs text-neutral-400 basis-full">
              0 ＝ 全部玩家用新 feed；設 50 就是一半玩家看舊的「頭部固定＋加權洗牌」，兩週後比這張表的點擊率與抽獎 Session。
              排除機器人帳號。曝光＝卡片進入視口 ≥50%，同一 Session 同一張卡只算一次。
            </p>
          </div>
        </PageCard>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatsCard title="Session" value={totals.s.toLocaleString()} />
          <StatsCard title="曝光" value={totals.imp.toLocaleString()} />
          <StatsCard title="點擊" value={totals.clk.toLocaleString()} />
          <StatsCard title="整體點擊率" value={totals.imp ? pct(totals.clk / totals.imp) : '—'} />
        </div>

        <PageCard title="A/B 變體">
          <DataTable<AbRow> columns={abColumns} data={data?.ab ?? []} isLoading={loading} keyField="id" emptyMessage="還沒有資料" />
        </PageCard>
        <PageCard title="各桶表現">
          <DataTable<BucketRow> columns={bucketColumns} data={data?.buckets ?? []} isLoading={loading} keyField="id" emptyMessage="還沒有資料" />
        </PageCard>
        <PageCard title="商品曝光排行（前 50）">
          <DataTable<TopRow> columns={topColumns} data={data?.top ?? []} isLoading={loading} keyField="id" emptyMessage="還沒有資料" />
        </PageCard>
        <PageCard title="目前話題（近 7 天，情報＋搜尋＋標籤）">
          <DataTable<TopicRow> columns={topicColumns} data={data?.topics ?? []} isLoading={loading} keyField="id" emptyMessage="還沒有話題" />
        </PageCard>
      </div>
    </AdminLayout>
  )
}
