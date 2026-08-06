'use client';

import Link from 'next/link';

/**
 * 關於我們
 *
 * 這一頁的職責：我們是誰、為什麼做這個、承諾什麼、怎麼找到我們。
 * 「什麼是 GGB」只在這裡講一次 —— 常見問題那邊原本也有一份一模一樣的，
 * 玩家點進兩個頁面讀到同一段話，第二次就不會再讀了。
 *
 * 操作教學一律不放這裡（那是常見問題的事），規則細節也不放
 *（那是會員條款與退換貨資訊的事），只留連結過去。
 */
export default function AboutPage() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-20">
      <div className="max-w-3xl mx-auto pt-4 md:pt-8 px-4">

        <div className="mb-6">
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">關於我們</h1>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 uppercase tracking-widest font-bold">ABOUT GGB</p>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800">

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">什麼是吉吉比</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              吉吉比（GGB）是台灣的線上潮玩抽獎平台，玩法包含一番賞、轉蛋、盒玩、抽卡與自製賞。
              你在手機上抽，抽到的東西先放進自己的倉庫，想出貨的時候再一次寄給你 ——
              不用為了一隻公仔跑一趟店面，也不必為了湊整套一直重複跑同一家店。
            </p>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">怎麼運作</h2>
            <div className="space-y-3 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              <p>
                商品由合作廠商供貨，平台負責上架、抽獎與出貨。每一檔的獎品內容與數量都寫在商品頁上，
                抽掉幾隻、還剩幾隻是即時更新的。
              </p>
              <p>
                抽到的獎品會存進你的倉庫。你可以留著慢慢湊、可以一次申請出貨省運費，
                也可以換回代幣繼續抽。節奏由你決定。
              </p>
            </div>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">為什麼要做這個</h2>
            <div className="space-y-3 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              <p>
                線上抽獎最常被問的一句話是「是不是被動了手腳」。這個問題玩家自己沒辦法回答 ——
                除非平台把驗算的方法一起交出來。
              </p>
              <p>
                所以一番賞、抽卡、自製賞這幾種有籤號的玩法，我們在<strong className="text-neutral-900 dark:text-white">開賣前</strong>就把
                每一支籤對應到哪個獎品排定、封存，並在商品頁公布一組驗證碼。
                這一檔結束後對照表會完整公開，任何人都能自己算一次核對 ——
                中途改過一個字，算出來的驗證碼就對不上。
              </p>
              <p className="text-neutral-500 dark:text-neutral-500">
                轉蛋與盒玩沒有籤號、是每一抽即時決定結果，所以走的是機率公開而不是對照表驗證。
                每一檔的獎品數量都寫在商品頁上。
                <Link href="/faq" className="text-primary font-bold underline underline-offset-2 ml-1">
                  看常見問題的詳細說明
                </Link>
              </p>
            </div>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">我們的承諾</h2>
            <ul className="space-y-2.5 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              <li className="flex gap-2"><span className="text-primary font-bold shrink-0">—</span>只賣正版授權商品，不碰盜版與仿冒</li>
              <li className="flex gap-2"><span className="text-primary font-bold shrink-0">—</span>獎品內容與剩餘數量公開，不藏在後台</li>
              <li className="flex gap-2"><span className="text-primary font-bold shrink-0">—</span>有籤號的玩法一律事前封存、事後公開對照表</li>
              <li className="flex gap-2"><span className="text-primary font-bold shrink-0">—</span>倉庫的東西是你的，我們只負責保管與寄出</li>
              <li className="flex gap-2"><span className="text-primary font-bold shrink-0">—</span>出問題找得到人，客服在 LINE 上</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">聯絡我們</h2>
            <div className="space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
              <p>官方 LINE：<span className="font-bold text-neutral-900 dark:text-white">@ggb.tw</span></p>
              <p>服務時間：週一至週六 12:00 – 22:00</p>
              <p>非服務時段留言會在下一個工作日回覆。</p>
              <p className="pt-2">
                也可以在
                <Link href="/faq" className="text-primary font-bold underline underline-offset-2 mx-1">常見問題</Link>
                頁面直接填表單回報，客服會用信箱或 LINE 回你。
              </p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
