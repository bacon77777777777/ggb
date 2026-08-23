'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { PageHeaderBack } from '@/components/ui/PageHeader'

/**
 * 帳號流程（登入／驗證碼／帳號密碼／重置密碼）共用的版型。
 *
 * 稿：Figma 480:3531 那組畫板。四張的外框是同一套 —— 右上角裝飾、浮在內容上的
 * 返回箭頭、左對齊大標＋副標、底部的同意條款。**不要在頁面裡各刻一份**，
 * 之前登入頁與重置密碼頁就是各長各的，改一邊另一邊不會跟上。
 *
 * ⚠️ 這裡刻意不用 SimplePageHeader：那條白底頂欄會把右上角的裝飾切掉。
 */

/** 主要動作鈕：327×48、圓角 6、字 16px w600 ＋ 主題色光暈 */
export const PRIMARY_BTN =
  'flex h-12 w-full items-center justify-center rounded-md bg-primary text-[16px] font-semibold leading-none text-white' +
  ' shadow-[0_5px_8px_rgb(var(--primary)/0.24)] transition-transform active:scale-[.99] disabled:opacity-60'

/** 輸入列：只有下緣一條 1px #F0F0F0，文字內縮 11px（稿上量的） */
export const FIELD_ROW = 'h-12 border-b border-[#F0F0F0] dark:border-neutral-800'
export const FIELD_INPUT =
  'h-full w-full bg-transparent pl-3 text-[14px] text-neutral-900 outline-none placeholder:text-[#999999] dark:text-white'

/** 次要文字連結（重新傳送、忘記密碼）：14px 主題色，靠右 */
export const SUB_LINK_ROW = 'mt-4 text-right text-[14px] leading-5'

/**
 * 大標與副標。稿上文字比外框再內縮 12px，不是齊按鈕邊。
 * `step` 給多步驟流程用（驗證碼登入 1/2、重置密碼 1/3…），單頁就不傳。
 */
export function AuthHeading({
  title,
  subtitle,
  step,
}: {
  title: string
  subtitle: string
  step?: { current: number; total: number }
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0 pl-3">
        <h1 className="text-[28px] font-semibold leading-[1.4] text-[#1D1D1D] dark:text-white">{title}</h1>
        <p className="mt-1 text-[13px] leading-[18px] text-[#999999]">{subtitle}</p>
      </div>
      {step && (
        /* 走完的那節是主題色實心，沒走完的是灰的短一截 */
        <div className="mt-[13px] flex shrink-0 items-center gap-2">
          {Array.from({ length: step.total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full',
                i < step.current ? 'w-8 bg-primary' : 'w-5 bg-[#DFDFDF]',
              )}
            />
          ))}
          <span className="text-[14px] leading-5 text-[#999999]">
            {step.current}/{step.total}
          </span>
        </div>
      )}
    </header>
  )
}

/**
 * 六格驗證碼。
 *
 * 六個獨立輸入格而不是一個長輸入框：手機鍵盤上看得出還要打幾位，填錯時能單獨改一格。
 * 對外仍然是同一個字串，送出的邏輯完全不用改。
 * `autoComplete="one-time-code"` 讓 iOS 能從簡訊／郵件自動填。
 */
export function OtpBoxes({
  value,
  onChange,
  autoFocus,
}: {
  value: string
  onChange: (next: string) => void
  autoFocus?: boolean
}) {
  // useRef 不是普通物件：普通物件每次 render 都重建，存進去的 DOM 參照會遺失，
  // 自動跳格就再也不會動
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const focus = (i: number) => refs.current[Math.max(0, Math.min(5, i))]?.focus()
  const setAt = (i: number, ch: string) => {
    const arr = value.padEnd(6, ' ').split('')
    arr[i] = ch || ' '
    onChange(arr.join('').trimEnd())
  }

  return (
    <div className="grid grid-cols-6 gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          value={value[i] ?? ''}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '')
            if (!digits) { setAt(i, ''); return }
            // 一次進來多位（自動填入）就從這格往後鋪
            if (digits.length > 1) {
              const arr = value.padEnd(6, ' ').split('')
              digits.split('').forEach((d, k) => { if (i + k < 6) arr[i + k] = d })
              onChange(arr.join('').trimEnd())
              focus(i + digits.length)
              return
            }
            setAt(i, digits)
            focus(i + 1)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !value[i]) { e.preventDefault(); setAt(i - 1, ''); focus(i - 1) }
            if (e.key === 'ArrowLeft') focus(i - 1)
            if (e.key === 'ArrowRight') focus(i + 1)
          }}
          onPaste={(e) => {
            const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
            if (!digits) return
            e.preventDefault()
            onChange(digits)
            focus(digits.length)
          }}
          /*
           * 邊框用 1px #CBCBCB，不是稿上的 0.5px #979797。
           *
           * 0.5px 在實機（3x）會落在半個實體像素上，瀏覽器各自四捨五入 ——
           * 同一排六格會有幾格的線直接消失（老闆 2026-08-23 實機截圖）。
           * #CBCBCB 是「0.5px 的 #979797 疊在白底上」的等效色，
           * 所以視覺份量跟稿一樣，但每一格都畫得出來。
           */
          className="aspect-square w-full rounded-[5px] border border-[#CBCBCB] bg-white text-center text-[20px] font-semibold text-neutral-900 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        />
      ))}
    </div>
  )
}

/** 外框：裝飾＋返回鍵＋內容＋頁尾同意條款 */
export function AuthScreen({
  onBack,
  banner,
  children,
}: {
  onBack: () => void
  /** 錯誤／訊息橫幅，沒有就不傳 */
  banner?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-white dark:bg-neutral-950">
      {/*
        右上角裝飾。稿上寫死 #FF3E00，這裡改用 `--primary` 的透明度疊法 ——
        後台換主題色時整頁才會一致，不會只有按鈕變色、角落還留著橘。
      */}
      <div aria-hidden className="pointer-events-none absolute right-0 top-0 z-0 h-[173px] w-[178px]">
        <div className="absolute left-0 top-0 h-[93px] w-[87px] bg-gradient-to-b from-primary/15 to-transparent" />
        <div className="absolute right-0 top-0 h-[80px] w-[91px] bg-primary/15" />
        <div className="absolute right-0 top-[80px] h-[93px] w-[91px] bg-gradient-to-b from-primary/[0.09] to-transparent" />
      </div>

      {/* 返回鍵用全站共用的那顆（老闆 2026-08-23：跟商品頁同一顆），標題留空只出箭頭 */}
      <div className="relative z-10 px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
        <PageHeaderBack title="" onBack={onBack} />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center px-6 pb-[calc(env(safe-area-inset-bottom)+34px)] pt-4">
        <div className="flex w-full max-w-sm flex-1 flex-col">
          {banner}
          {children}
          <p className="mt-auto pt-10 text-center text-[13px] leading-[18px] text-[#686868] dark:text-neutral-400">
            登入即代表您同意
            <Link href="/privacy" className="text-primary">《隱私政策》</Link>
            和
            <Link href="/terms" className="text-primary">《用戶協議》</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
