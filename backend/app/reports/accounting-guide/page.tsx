'use client'

import AdminLayout from '@/components/AdminLayout'
import PageCard from '@/components/PageCard'
import Link from 'next/link'

/**
 * 會計對接說明 —— 給外包會計師與管理員看的常駐頁。
 *
 * 不是純文字說明：把「帳務原則」＋「現有對帳報表索引」＋「對帳公式」合在一起，
 * 會計師點進去就能到每一張真實報表。內容是靜態的（帳務模型不常變），
 * 更新時直接改這支。列印友善（給事務所紙本也行）。
 */

const SPECIAL_POINTS = [
  {
    t: '代幣是「預收款（負債）」，不是收入',
    d: '玩家儲值的當下，錢進來只是「公司欠玩家一批抽獎次數」。這筆不能認列成營收，要掛在負債。',
  },
  {
    t: '收入實現時點＝代幣被抽獎消耗',
    d: '玩家真正拿代幣去抽獎的那一刻，對應的金額才轉為已實現營收。未消耗的代幣餘額＝期末對玩家的負債。',
  },
  {
    t: '贈點（bonus／行銷送的代幣）不是收入',
    d: '買 1000 送 80 的那 80、活動補償、測試補幣都不是玩家付的錢，屬行銷費用／負債，要跟真實儲值分開。',
  },
  {
    t: '所有財務數字排除機器人帳號',
    d: '平台有撐人氣用的機器人帳號與假交易（is_bot），一律不進任何財務計算。系統匯出的報表已自動排除。',
  },
]

const REPORTS = [
  { name: '儲值明細', path: '/recharges', use: '玩家真實付款紀錄（綠界）。收入端對帳的起點：每筆付款對應一筆入帳。' },
  { name: '手動調整明細', path: '/reports/adjustments', use: '所有「手動補幣」依會計分類拆開（行銷贈點／帳務更正／內部測試／運費／商城…）。稽核重點。' },
  { name: '消費明細', path: '/reports/products', use: '抽獎消耗紀錄——收入實現的依據（代幣在哪個商品被消耗）。' },
  { name: '分解明細', path: '/reports/dismantled', use: '玩家把獎品分解退還代幣的紀錄，屬代幣負債的增減。' },
  { name: '折價券明細', path: '/reports/coupons', use: '折價券發放與使用，影響實收金額。' },
  { name: '物流明細', path: '/reports/logistics', use: '出貨與運費（運費走手動調整的 shipping_fee 分類）。' },
  { name: '廠商結算', path: '/reports/settlement', use: '廠商供貨、平台抽成，算應付貨款與分潤。' },
  { name: '廠商月結管理', path: '/settlement-snapshots', use: '每月跟各廠商結算的快照，月結對帳基礎。' },
]

const TAX_ITEMS = [
  '營業稅 5% ＋ 電子發票開立',
  '營所稅、正式財務報表（損益表、資產負債表——代幣負債是重點科目）',
  '虛擬代幣的稅務認列時點（儲值時 vs 消耗時，建議向國稅局確認）',
  '第三方儲值／預收款的法遵要求',
]

export default function AccountingGuidePage() {
  return (
    <AdminLayout pageTitle="會計對接說明">
      <div className="space-y-6 max-w-4xl">

        <PageCard>
          <div className="p-6">
            <h2 className="text-lg font-bold text-neutral-900 mb-1">給會計師與管理員</h2>
            <p className="text-sm text-neutral-500 leading-relaxed">
              本頁說明本平台（虛擬代幣＋廠商供貨的線上轉蛋平台）的帳務模型、對帳公式，
              以及系統已備好的各張對帳報表。會計師負責「拿系統給的數字做收入認列、代幣負債結算、
              廠商月結、稅務申報」；平台負責「把每一筆錢、每一次抽獎、每一次調整記清楚並可匯出」。
            </p>
          </div>
        </PageCard>

        <PageCard>
          <div className="p-6">
            <h3 className="text-base font-bold text-neutral-900 mb-4">一、帳務四個特殊點（務必先抓）</h3>
            <div className="space-y-4">
              {SPECIAL_POINTS.map((p, i) => (
                <div key={i} className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <div>
                    <div className="text-sm font-bold text-neutral-900">{p.t}</div>
                    <div className="text-sm text-neutral-500 leading-relaxed mt-0.5">{p.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </PageCard>

        <PageCard>
          <div className="p-6">
            <h3 className="text-base font-bold text-neutral-900 mb-3">二、對帳公式</h3>
            <div className="bg-neutral-50 rounded-xl p-4 font-mono text-sm text-neutral-800 leading-relaxed">
              應有代幣餘額 ＝ 真實儲值 ＋ 手動調整 − 抽獎消耗 − 退款沖銷
            </div>
            <p className="text-xs text-neutral-500 mt-3 leading-relaxed">
              系統以此公式每 3 小時自動跟綠界金流對帳（<span className="font-mono">ecpay-reconcile</span>），
              CFO AI 每日產出代幣對帳與收入趨勢。統一帳本 <span className="font-mono">token_ledger</span> 合併
              儲值／抽獎／手動調整三來源，逐筆可追。
            </p>
          </div>
        </PageCard>

        <PageCard>
          <div className="p-6">
            <h3 className="text-base font-bold text-neutral-900 mb-1">三、系統已備好的對帳報表</h3>
            <p className="text-xs text-neutral-500 mb-4">點各項可直接開啟報表，皆可依日期區間篩選並匯出，且已排除機器人。</p>
            <div className="divide-y divide-neutral-100">
              {REPORTS.map((r) => (
                <div key={r.path} className="py-3 flex items-start gap-4">
                  <Link href={r.path} className="shrink-0 w-28 text-sm font-bold text-primary hover:underline">
                    {r.name} ↗
                  </Link>
                  <span className="text-sm text-neutral-500 leading-relaxed flex-1">{r.use}</span>
                </div>
              ))}
            </div>
          </div>
        </PageCard>

        <PageCard>
          <div className="p-6">
            <h3 className="text-base font-bold text-neutral-900 mb-3">四、統編下來後才加入的稅務範圍</h3>
            <p className="text-xs text-neutral-500 mb-3">公司統編申請完成、換綠界正式金流開始收真錢後才適用：</p>
            <ul className="space-y-2">
              {TAX_ITEMS.map((t, i) => (
                <li key={i} className="text-sm text-neutral-600 flex gap-2">
                  <span className="text-neutral-300">•</span><span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </PageCard>

        <p className="text-xs text-neutral-400 px-1">
          帳務模型如有調整，直接更新本頁（backend/app/reports/accounting-guide/page.tsx）。
        </p>
      </div>
    </AdminLayout>
  )
}
