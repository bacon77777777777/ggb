'use client'

import { useEffect, useState } from 'react'
import { NATIVE_APP_UA_TAG } from './nativeApp'

/** 同步判斷（只能在瀏覽器呼叫）。SSR 時沒有 navigator，一律回 false。 */
export function checkNativeAppUA(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.userAgent.includes(NATIVE_APP_UA_TAG)
}

/**
 * 是否跑在原生殼裡（iOS Capacitor / Android TWA），用來隱藏入口。
 *
 * `resolved` 是關鍵：初值一律 false（server 端沒有 navigator，若在 render 期間猜值
 * 會造成 hydration 不一致），所以第一次 render 的 `isNative` 是「還不知道」而不是
 * 「不是 App」。消費端要等 `resolved` 才能下判斷，否則 App 裡會先閃一次
 * 商城入口／轉址到被擋掉的網址。
 *
 * ⚠️ 這只負責「不要讓玩家看到」。真正的擋門在 middleware（C2C 路徑直接回 404）。
 */
export function useNativeAppState(): { isNative: boolean; resolved: boolean } {
  const [state, setState] = useState({ isNative: false, resolved: false })

  useEffect(() => {
    setState({ isNative: checkNativeAppUA(), resolved: true })
  }, [])

  return state
}

export function useIsNativeApp(): boolean {
  return useNativeAppState().isNative
}
