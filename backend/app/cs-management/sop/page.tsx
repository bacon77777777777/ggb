'use client'

import AdminLayout from '@/components/AdminLayout'

const SOP_SECTIONS = [
  {
    title: '情境一：代幣問題',
    situations: [
      {
        problem: '用戶說代幣被扣但沒有成功儲值',
        steps: [
          '請用戶提供付款截圖（銀行轉帳明細、信用卡消費確認或超商收據）',
          '到後台「財務對帳 → 儲值紀錄」搜尋該用戶，確認是否有對應的 ECPay 成功回調',
          '若 ECPay 有成功紀錄但代幣未入帳 → 可能是 webhook 失敗，後台「補幣」功能手動補發',
          '若 ECPay 無紀錄 → 確認是否為重複扣款。若是，補貼等值代幣並聯繫 ECPay 協助退款',
          '處理完畢在工單備註記錄補幣金額與原因',
        ],
        compensation: '補發等值代幣（無金流異常不退現金）',
      },
      {
        problem: '用戶說代幣餘額顯示異常（應有卻沒有）',
        steps: [
          '後台「會員管理」→ 搜尋該用戶 → 查看代幣餘額與帳本明細',
          '確認近期是否有分解、活動扣除或帳號被操作',
          '若確認為平台錯誤 → 使用「手動補幣」功能，reason 填寫「平台顯示錯誤補償」',
          '在工單備註記錄補幣金額與原因',
        ],
        compensation: '依實際差額補發代幣',
      },
    ],
  },
  {
    title: '情境二：抽獎問題',
    situations: [
      {
        problem: '用戶說抽獎扣幣但無結果/無紀錄',
        steps: [
          '後台「抽獎紀錄」搜尋該用戶，確認指定時間是否有扣幣紀錄',
          '若有扣幣紀錄但品項未進倉庫 → 確認 draw_records 的 status（可能是 db 寫入失敗）',
          '若確認平台錯誤 → 手動補發對應代幣或商品（視情況），並在 action_logs 備註',
          '若用戶查驗哈希值對不上 → 請提供具體籌號，截圖調查，必要時升級給技術處理',
        ],
        compensation: '補發代幣（等同抽獎消耗額）或重新抽獎（需技術協助）',
      },
      {
        problem: '用戶質疑機率不公平',
        steps: [
          '引導用戶前往「公平驗證」頁面，輸入籤號自行驗算哈希值',
          '說明：隨機種子在商品上架時已封存，結果可被任何人驗算，平台無法事後修改',
          '若用戶堅持投訴 → 在工單備註記錄，並告知已轉給平台技術評估',
          '不提供退款（抽獎結果不滿意不在退款範圍）',
        ],
        compensation: '無補償（機率公正透明，不接受以結果不滿為由退款）',
      },
    ],
  },
  {
    title: '情境三：商品問題',
    situations: [
      {
        problem: '收到商品有缺件或寄錯品',
        steps: [
          '確認用戶是否在「收到商品 7 日內」提出',
          '請用戶提供：① 訂單編號 ② 完整開箱錄影（從外包裝未拆封到取出全程不中斷）③ 問題照片',
          '後台「配送管理」確認該訂單的商品與廠商',
          '若確認缺件/寄錯：聯繫供貨廠商補寄，若廠商無庫存則補發等值代幣',
          '在工單備註記錄廠商名稱與處理方式',
        ],
        compensation: '補寄正確商品，若廠商缺貨則補發等值代幣',
      },
      {
        problem: '商品有製造瑕疵（非盒損）',
        steps: [
          '同上，確認 7 日內提出且有完整開箱影片',
          '瑕疵程度輕微（印刷偏移、輕微刮痕）→ 屬原廠出廠正常，告知不在補件範圍',
          '瑕疵明顯（零件斷裂、嚴重損壞、缺件）→ 聯繫廠商評估補件或退貨',
          '若廠商確認為瑕疵品 → 補寄或補代幣',
        ],
        compensation: '依廠商認定：補寄同款商品或補發等值代幣',
      },
    ],
  },
  {
    title: '情境四：出貨問題',
    situations: [
      {
        problem: '用戶說已超過預期時間未收到貨',
        steps: [
          '後台「配送管理」確認訂單狀態與物流追蹤號',
          '若已取得物流號 → 提供給用戶，請至物流公司官網自行查詢',
          '若物流號顯示「退件」→ 確認原因（地址錯誤/無人收件），告知再次出貨需負擔運費',
          '若超過 15 個工作天仍無追蹤資訊 → 聯繫物流商查詢，確認是否遺失',
          '若確認遺失 → 補寄或補代幣（視商品庫存）',
        ],
        compensation: '確認遺失後補寄；地址錯誤/拒收需用戶自付再次出貨運費',
      },
      {
        problem: '用戶要修改收件地址',
        steps: [
          '確認訂單是否已「確認出貨」（狀態已出貨）',
          '若尚未出貨 → 後台「配送管理」可編輯收件地址',
          '若已出貨 → 告知無法修改，建議用戶聯繫物流公司（黑貓/郵局）攔截或安排轉寄',
        ],
        compensation: '無補償（已出貨後無法修改為平台規定）',
      },
    ],
  },
]

export default function CsSopPage() {
  return (
    <AdminLayout pageTitle="客服操作手冊">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* 補償原則 */}
        <div className="bg-white rounded-xl border border-neutral-200 px-5 py-4">
          <p className="text-sm font-bold text-neutral-700 mb-2">補償原則（請優先遵守）</p>
          <ul className="space-y-1 text-sm text-neutral-500">
            <li>① 補償優先以「補代幣」方式處理，不退現金（除非確認重複扣款等金流錯誤）</li>
            <li>② 代幣已儲值一律不退款；抽獎結果不滿意不在退款範圍</li>
            <li>③ 商品缺件/瑕疵需 7 日內提出，且必須有完整開箱錄影</li>
            <li>④ 所有補償操作後，於工單備註記錄原因與金額</li>
          </ul>
        </div>

        {/* SOP sections */}
        {SOP_SECTIONS.map((section) => (
          <div key={section.title} className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50">
              <h2 className="text-sm font-bold text-neutral-700">{section.title}</h2>
            </div>
            <div className="divide-y divide-neutral-100">
              {section.situations.map((sit, i) => (
                <div key={i} className="p-5 space-y-3">
                  <p className="text-sm font-semibold text-neutral-800">{sit.problem}</p>
                  <ol className="space-y-1.5">
                    {sit.steps.map((step, si) => (
                      <li key={si} className="flex gap-2.5 text-sm text-neutral-500">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-100 text-neutral-500 flex items-center justify-center text-[11px] font-bold mt-0.5">{si + 1}</span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600">
                    補償結果：{sit.compensation}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* 補幣操作 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <p className="text-sm font-bold text-neutral-700 mb-2">補幣操作方式</p>
          <ol className="space-y-1 text-sm text-neutral-500">
            <li>1. 後台左側 → 會員管理 → 搜尋對應用戶</li>
            <li>2. 點擊用戶進入詳細頁面 → 「手動補幣」按鈕</li>
            <li>3. 輸入補幣數量與原因，送出後系統自動寫入 token_adjustments 並更新代幣餘額</li>
            <li>4. CFO 對帳報表中會以「手動調整」欄目獨立顯示，不影響 ECPay 儲值對帳</li>
          </ol>
        </div>

      </div>
    </AdminLayout>
  )
}
