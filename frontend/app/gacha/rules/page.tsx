'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import SimplePageHeader from '@/components/ui/SimplePageHeader';

const steps = [
  {
    step: 1,
    title: '選擇商品並抽獎',
    items: [
      {
        label: '立即抽獎',
        desc: '點擊「立即抽獎」，使用 G幣 確認購買並抽取。每次抽取結果即時產生，無法取消或重抽。',
      },
      {
        label: '試一試',
        desc: '免費體驗抽獎動畫效果，不消耗 G幣、不實際出獎，僅供預覽用。',
      },
    ],
  },
  {
    step: 2,
    title: '獲得抽獎結果',
    items: [
      {
        label: '查看結果',
        desc: '抽獎結果即時顯示，獎品自動存入帳號「我的倉庫」。可前往「個人中心 → 抽獎紀錄」查看歷史記錄。每次抽取均為獨立隨機，與前後抽次無關。',
      },
    ],
  },
  {
    step: 3,
    title: '申請配送',
    items: [
      {
        label: '前往我的倉庫',
        desc: '進入「個人中心 → 我的倉庫」選取獎品後申請配送。倉庫提供 30 天免費寄存，逾期系統將自動分解品項並返還相應代幣，請務必在期限內申請配送。',
      },
    ],
  },
];

export default function GachaRulesPage() {
  const router = useRouter();
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/platform-settings')
      .then(r => r.json())
      .then((map: Record<string, string>) => {
        if (map.free_shipping_threshold) setFreeShippingThreshold(Number(map.free_shipping_threshold));
      })
      .catch(() => {});
  }, []);

  const thresholdText = freeShippingThreshold != null ? `${freeShippingThreshold}` : '—';

  const rules = [
    {
      label: '配送訂單查詢',
      desc: '申請配送後，可進入「個人中心 → 我的訂單」查看配送訂單狀態與物流資訊。',
    },
    {
      label: '配送時間',
      desc: '廠商備貨後配送，約 3–7 個工作天送達（不含假日）。活動檔期或特殊情況可能稍有延遲，詳情請聯繫客服。',
    },
    {
      label: '倉庫寄存',
      desc: '獎品存入我的倉庫後提供 30 天免費寄存。第 31 天起，系統將自動分解未申請配送的品項並返還相應代幣至帳戶，請務必在期限內申請配送。',
    },
    {
      label: '免運條件',
      desc: `單次申請配送達 ${thresholdText} 件（含）以上免收運費。僅限台灣本島配送，不支援離島、港澳及海外地區。`,
    },
    {
      label: '分解規則',
      desc: '我的倉庫內品項可隨時手動申請分解，系統將依商品類別計算分解金額，返還相應代幣至帳戶。分解操作確認後無法還原，請確認後再執行。',
    },
    {
      label: '售後服務',
      desc: '收到商品後若發現缺件或品質問題，請於 7 日內聯繫客服，並提供訂單編號及完整開箱錄影（從未拆封外包裝到內容物全程）。逾期或無影片佐證將無法受理。',
    },
    {
      label: '配送延誤',
      desc: '若配送後 7 個工作天仍未收到商品，請聯繫客服查詢物流狀態。確認異常者，平台將協助追件或處理。',
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-16 pt-14">
      <SimplePageHeader title="轉蛋規則" onBack={() => router.back()} maxWidth="max-w-[960px]" />

      <div className="max-w-[560px] md:max-w-[960px] mx-auto px-4 py-6 space-y-4 md:space-y-8">

        {/* Steps */}
        <div className="space-y-10 md:grid md:grid-cols-3 md:gap-6 md:space-y-0 md:pt-8">
        {steps.map(({ step, title, items }) => (
          <div key={step} className="relative">
            <div className="absolute -top-5 right-4 w-[100px] h-[100px] pointer-events-none z-10">
              <Image
                src={`/images/rules/${step}.png`}
                alt={title}
                fill
                sizes="100px"
                className="object-contain drop-shadow-lg"
              />
            </div>
            <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 shadow-sm md:flex md:flex-col md:h-full">
              <div className="bg-primary/10 dark:bg-primary/20 px-5 pt-5 pb-5 rounded-t-3xl min-h-[100px]">
                <div className="pr-28">
                  <span className="inline-block text-[13px] font-black text-white bg-primary px-3.5 py-1.5 rounded-full mb-2.5">步驟 {step}</span>
                  <p className="text-[20px] font-black text-neutral-900 dark:text-white leading-snug whitespace-nowrap">{title}</p>
                </div>
              </div>
              <div className="px-5 py-5 space-y-5 md:flex-1">
                {items.map(({ label, desc }) => (
                  <div key={label} className="flex gap-3 items-start">
                    <div className="mt-[7px] w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    <div>
                      <p className="text-[15px] font-black text-neutral-900 dark:text-white mb-1">{label}</p>
                      <p className="text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        </div>

        {/* Rules */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden border border-neutral-100 dark:border-neutral-800">
          <div className="bg-neutral-100 dark:bg-neutral-800 px-5 py-3 border-b border-neutral-100 dark:border-neutral-800">
            <p className="text-[16px] font-black text-neutral-900 dark:text-white">規則說明</p>
          </div>
          <div className="px-5 py-4 space-y-5 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-5 md:space-y-0">
            {rules.map(({ label, desc }) => (
              <div key={label}>
                <span className="inline-block text-[12px] font-black text-primary bg-primary/10 px-2.5 py-0.5 rounded-full mb-1.5">{label}</span>
                <p className="text-[13px] text-neutral-600 dark:text-neutral-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Special notice */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 px-5 py-5">
          <p className="text-[13px] font-black text-neutral-900 dark:text-white mb-2">特別說明</p>
          <p className="text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
            轉蛋為機率性商品，每次抽取結果一經確認即完成交易，不適用無條件退款或換款。如對商品本身有疑慮，請於購買前詳閱商品說明。
          </p>
          <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800">
            <p className="text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              聯繫客服：可透過「個人中心 → 聯絡客服」填寫表單，或加入 GGB 官方 LINE 帳號聯繫，客服將盡速回覆。
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
