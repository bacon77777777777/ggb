'use client'

import { useState, useCallback } from 'react'
import { AdminLayout, PageCard } from '@/components'
import CodeGate from './CodeGate'

import { ImportJobsPanel } from '@/app/products/import/Panel'
import { AgentEventsPanel } from '@/app/agent-events/Panel'
import { CompetitorIntelPanel } from '@/app/competitor-intel/Panel'
import { ContentDraftsPanel } from '@/app/content-drafts/Panel'
import { AiUsagePanel } from '@/app/ai-usage/Panel'
import { ToolsPanel } from '@/app/tools/Panel'
import { RatesPanel } from '@/app/settings/rates/Panel'
import { DesignSystemPanel } from '@/app/design-system/Panel'
import { FrontendDesignSystemPanel } from '@/app/frontend-design-system/Panel'
import { FeedReportPanel } from '@/app/reports/feed/Panel'

/**
 * 其他設定
 *
 * 原本「其他黑科技」那一組九個獨立頁面併成這一頁，版面照「功能開關」：
 * 左邊頁籤、右邊內容。這幾個頁面都是偶爾才用一次的工具，各自佔一條側欄
 * 項目只是把選單撐長。
 *
 * 各頁的路由沒有拿掉，內容是同一個元件 —— 舊連結與書籤照樣能開。
 *
 * 進來要先過六位數字代碼（`CodeGate`）。殺率調整、爬取工具這類東西
 * 不該手滑就點進去。
 */
type SectionKey =
  | 'import' | 'events' | 'competitor' | 'drafts' | 'usage'
  | 'tools' | 'rates' | 'feed' | 'ds' | 'frontendDs'

const SECTIONS: { key: SectionKey; label: string; render: () => React.ReactNode }[] = [
  { key: 'import',     label: '商品補齊',       render: () => <ImportJobsPanel /> },
  { key: 'events',     label: '事件中心',       render: () => <AgentEventsPanel /> },
  { key: 'competitor', label: '競品情報',       render: () => <CompetitorIntelPanel /> },
  { key: 'drafts',     label: 'AI 文案草稿',    render: () => <ContentDraftsPanel /> },
  { key: 'usage',      label: 'AI 用量',        render: () => <AiUsagePanel /> },
  { key: 'tools',      label: '競品爬取工具',   render: () => <ToolsPanel /> },
  { key: 'rates',      label: '殺率調整',       render: () => <RatesPanel /> },
  /* 推薦 feed 報表搬進來（老闆 2026-08-26）：它唯一的操作是調 A/B 比例，
     那是要驗證演算法時才做一次的事，不是營運日常。放在側欄第三位太搶。
     資料照收，路由 /reports/feed 也留著。 */
  { key: 'feed',       label: '推薦 feed 報表', render: () => <FeedReportPanel /> },
  { key: 'ds',         label: 'Design System',  render: () => <DesignSystemPanel /> },
  { key: 'frontendDs', label: '前台 DS 稽核',   render: () => <FrontendDesignSystemPanel /> },
]

export default function OtherSettingsPage() {
  const [unlocked, setUnlocked] = useState(false)
  const [section, setSection] = useState<SectionKey>('import')
  const pass = useCallback(() => setUnlocked(true), [])

  if (!unlocked) {
    return (
      <AdminLayout pageTitle="其他設定">
        <CodeGate onPass={pass} />
      </AdminLayout>
    )
  }

  const current = SECTIONS.find(s => s.key === section) ?? SECTIONS[0]

  return (
    <AdminLayout pageTitle="其他設定">
      <PageCard>
        <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
          {/* 分區導覽。手機上橫向捲動，桌機才靠左直排（照功能開關頁） */}
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

          <div className="min-w-0 flex-1">{current.render()}</div>
        </div>
      </PageCard>
    </AdminLayout>
  )
}
