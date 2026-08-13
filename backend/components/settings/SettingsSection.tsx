'use client'

/**
 * 設定頁的共用版型：左側分區導覽 + 右側內容。
 *
 * 原本這幾個小元件是寫死在「功能開關」頁裡面的。做「商城設定」時老闆要求兩頁長一樣，
 * 與其複製一份（兩份遲早會走鐘），不如抽出來共用 —— 改一次兩頁一起變。
 *
 * 版型密度照 Ant Design Pro 的個人設定頁：
 * 導覽項目 40 高、內容標題 20px、每列 14px 標題配 14px 灰色說明。
 * 後台其他頁面偏小偏粗，但設定頁的重點是看得懂，不是塞得多。
 */

import InfoDot from '@/components/ui/InfoDot'
import type { ReactNode } from 'react'

export type SettingsTone = 'on' | 'warn' | 'off'

export const STATE_TONE: Record<'on' | 'maintenance' | 'off', string> = {
  on: 'bg-green-500',
  maintenance: 'bg-amber-400',
  off: 'bg-neutral-300',
}

/**
 * 左側分區導覽。
 * 手機上橫向捲動，桌機才靠左直排並拉一條分隔線。
 */
export function SettingsNav<T extends string>({ sections, value, onChange }: {
  sections: { key: T; label: string }[]
  value: T
  onChange: (key: T) => void
}) {
  return (
    <nav className="-mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:w-56 lg:flex-col lg:gap-0 lg:overflow-visible lg:border-r lg:border-neutral-100 lg:px-0 lg:pb-0 lg:pr-6">
      {sections.map(sc => {
        const active = value === sc.key
        return (
          <button
            key={sc.key}
            type="button"
            onClick={() => onChange(sc.key)}
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
  )
}

/** 導覽 + 內容的外框，兩者間距一致 */
export function SettingsShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
      {nav}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function SectionHead({ title, info, right }: {
  title: string
  info: ReactNode
  right?: ReactNode
}) {
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
export function SettingsRow({ title, desc, state, dimmed, children }: {
  title: ReactNode
  desc?: ReactNode
  state?: 'on' | 'maintenance' | 'off'
  /** 這一列現在沒作用（上游關著）。整列變淡，控制項由呼叫端一併鎖住 */
  dimmed?: boolean
  children: ReactNode
}) {
  return (
    <div className={`flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8 ${
      dimmed ? 'opacity-40' : ''
    }`}>
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
 * 設定頁統一用它，不用 Switch。開關只表達得了「開」跟「不開」，
 * 講不出不開的時候是什麼 —— 類別是三態，商城的兩個選項是兩種具名狀態，
 * 這些用開關根本表達不了。剩下的即使真的只有開/關，
 * 把字寫出來也比讓人從顏色推語意可靠，順便讓整頁只有一種控制項。
 */
export function Segmented({ value, options, disabled, onChange, className = '' }: {
  value: string
  options: { v: string; label: string; tone: SettingsTone }[]
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
