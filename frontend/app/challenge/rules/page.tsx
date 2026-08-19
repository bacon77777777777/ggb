'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import SimplePageHeader from '@/components/ui/SimplePageHeader';

const steps = [
  {
    step: 1,
    title: '選機台上機',
    items: [
      {
        label: '挑一台機台',
        desc: '挑戰列表可看到每台目前的進度與今日中獎次數，挑好直接上機。上機後機台會為你保留座位，一人一台互不干擾。',
      },
      {
        label: '選擇每轉金額',
        desc: '每轉金額 10〜300G 自由選擇，金額愈高、對應的卡牌獎池愈高級。上機後該場金額鎖定，下機後可重新選擇。',
      },
    ],
  },
  {
    step: 2,
    title: '旋轉與 RUSH',
    items: [
      {
        label: '每轉都有返還',
        desc: '每一轉都會退回一些 G 幣（最低為投入金額的 20%），同時進度 +1。進度記在機台上，中途離開也不會歸零。',
      },
      {
        label: '進入 RUSH',
        desc: '每一轉都有機率直接進入 RUSH；一直沒中也沒關係，進度滿 200 轉保證進入。RUSH 中每一轉掉出一張實體卡牌，能連幾張看運氣。',
      },
    ],
  },
  {
    step: 3,
    title: '處理卡牌',
    items: [
      {
        label: '前往我的倉庫',
        desc: '抽到的卡牌自動存入「個人中心 → 我的倉庫」，可申請寄送到家，也可以分解換回 G 幣。倉庫提供 30 天免費寄存，逾期系統將自動分解並返還相應代幣。',
      },
    ],
  },
];

export default function ChallengeRulesPage() {
  const router = useRouter();

  const rules = [
    {
      label: '進度不會歸零',
      desc: '保底進度記在機台上，中途離開、換人接手、隔天再來都不會被清掉。進度滿 200 轉必定進入 RUSH，進入後進度重新累積。',
    },
    {
      label: '結果即時定案',
      desc: '按下旋轉的那一刻結果就已確定，就算斷線或關掉頁面，拿到的卡牌一樣會進入你的倉庫。每一轉花了多少、拿回多少，都能在「個人中心 → 消費明細」查到。',
    },
    {
      label: '直擊說明',
      desc: '直擊為付費直接進入 RUSH，價格＝剩餘保底轉數 × 每轉金額（已經轉愈多、直擊愈便宜）。直擊後抽到的內容與自己轉進去完全相同，費用一經扣除不予退還，RUSH 中無法再次直擊。',
    },
    {
      label: '座位機制',
      desc: '上機後機台為你保留 30 秒，每次旋轉或直擊 +60 秒（最長 90 秒）。閒置到期會自動讓位給其他玩家，離開前 15 秒畫面會先提示。',
    },
    {
      label: '配送時間',
      desc: '廠商備貨後配送，約 3–7 個工作天送達（不含假日）。活動檔期或特殊情況可能稍有延遲，詳情請聯繫客服。',
    },
    {
      label: '倉庫寄存',
      desc: '卡牌存入我的倉庫後提供 30 天免費寄存。第 31 天起，系統將自動分解未申請配送的品項並返還相應代幣至帳戶，請務必在期限內申請配送。',
    },
    {
      label: '分解規則',
      desc: '我的倉庫內卡牌可隨時手動申請分解，系統將依卡牌回收價值返還相應代幣至帳戶。分解操作確認後無法還原，請確認後再執行。',
    },
    {
      label: '售後服務',
      desc: '收到卡牌後若發現缺件或品質問題，請於 7 日內聯繫客服，並提供訂單編號及完整開箱錄影（從未拆封外包裝到內容物全程）。逾期或無影片佐證將無法受理。',
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-16 safe-header-offset">
      <SimplePageHeader title="挑戰機台規則" onBack={() => router.back()} maxWidth="max-w-[960px]" />

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
            挑戰機台為機率性商品，每次旋轉結果一經確認即完成交易，不適用無條件退款或更換。如遇卡牌缺貨，將以 G幣 原額退還。如對玩法有疑慮，請於上機前詳閱本說明。
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
