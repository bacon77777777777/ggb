'use client';

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
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">什麼是 GGB 吉吉比？</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              GGB 吉吉比是台灣正版潮玩線上平台，提供一番賞、轉蛋、盒玩、抽卡等多元玩法。我們以「廠商供貨、平台出貨」為核心模式，嚴格把關商品正版授權，讓收藏家隨時隨地都能享受開盲盒的樂趣與驚喜。
            </p>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">我們的理念</h2>
            <div className="space-y-3 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              <p>
                市場上許多線上抽獎平台機率不透明、結果難以驗證。GGB 導入哈希值驗證機制，每一次抽獎的隨機種子（Seed）在抽前公開，抽後可供任何人自行驗算，確保結果真實不可竄改。
              </p>
              <p>
                我們相信收藏不只是消費，更是一種生活方式。平台持續引進市場最新商品，並提供安全的倉庫寄存服務，讓您依自己的節奏決定何時出貨。
              </p>
            </div>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">我們的承諾</h2>
            <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
              <li className="flex gap-2"><span className="text-primary font-bold shrink-0">—</span>所有商品均為官方正版授權，不販售盜版或仿冒品</li>
              <li className="flex gap-2"><span className="text-primary font-bold shrink-0">—</span>抽獎機率公開透明，結果可哈希驗證</li>
              <li className="flex gap-2"><span className="text-primary font-bold shrink-0">—</span>倉庫商品安全保管，出貨快速確實</li>
              <li className="flex gap-2"><span className="text-primary font-bold shrink-0">—</span>客服以 LINE 官方帳號為主要聯絡管道，盡速回覆</li>
            </ul>
          </section>

          <section className="p-6">
            <h2 className="text-base font-black text-neutral-900 dark:text-white mb-3">聯絡我們</h2>
            <div className="space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
              <p>官方 LINE：<span className="font-bold text-neutral-900 dark:text-white">@ggb.tw</span></p>
              <p>服務時間：週一至週六 12:00 – 22:00</p>
              <p>非服務時段留言將於下一工作日回覆。</p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
