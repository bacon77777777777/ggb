"use client";

/*
 * 實名認證：吉吉比沒有這個功能。
 *
 * cardx 原型帶了一整頁 KYC 表單，資料寫 `kyc_applications` —— 那張表在我們的資料庫
 * 不存在，所以整頁其實一直在跟 localStorage 說話（送出後只有這台電腦看得到「審核中」）。
 * 我們是抽獎平台不是交易所，開抽與配送都不需要實名，門檻一併移除。
 *
 * 這頁留著只為了把還連過來的舊連結接住（市集頁還有一個），直接送回會員中心，
 * 不讓玩家撞到 404。
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AccountKycPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/account");
  }, [router]);

  return null;
}
