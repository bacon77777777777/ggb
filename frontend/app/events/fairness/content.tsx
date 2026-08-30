'use client'

import LpRenderer, { type LpPreset } from '@/components/lp/LpRenderer'
import { asset } from '@/lib/asset'

/**
 * 抽獎公平性說明頁 —— 常駐頁，內容寫在程式碼裡，不進後台「活動頁管理」。
 *
 * 2026-08-28 之前這頁是後台活動頁模組的一筆資料（events.slug = 'fairness'）。
 * 但它不是檔期活動：不會下架、不會換檔、內容是對玩家的公平性承諾，
 * 由 FAQ、服務條款、退換貨三頁與首頁底部警語列指過來。放在 CMS 裡的代價是
 * 到處要為它開特例 —— 後端刪除 API 回 403、後台列表隱藏刪除鍵、清全站資料的
 * 腳本要寫 `WHERE slug <> 'fairness'`。三個特例養一頁永遠不會被編輯的內容。
 *
 * 改成程式碼之後：那三個特例全部拿掉，改動進 git 有版本可回溯，
 * 清資料腳本直接 `DELETE FROM events` 不必留例外。要改內容就改這個檔案。
 *
 * 視覺完全沿用活動頁模組（`LpRenderer`），所以跟改之前長得一模一樣 ——
 * 這裡換掉的只有「資料從哪來」，沒有重寫任何版面。
 */
const FAIRNESS: LpPreset = {
  event: {
    slug: 'fairness',
    title: '抽獎公平性',
    bg_color: '#0a0610',
    accent_color: '#2ecc71',
    theme_mode: 'dark',
    hero_mode: 'dark',
    is_active: true,
    start_at: null,
    end_at: null,
    linked_category_id: null,
  },
  sections: [
    {
      type: 'hero',
      sort_order: 0,
      content: {
        bare: true,
        bg_image_url: asset('/images/fairness/hero2.webp'),
        cta_text: '立即開抽',
        cta_url: '/',
      },
    },
    {
      type: 'text',
      sort_order: 1,
      content: {
        h2: '驗證碼是什麼',
        body:
          '開獎前，平台會先產生一組驗證碼。\n' +
          '開獎後，你可以用開獎結果自己驗證。\n' +
          '如果偷修改開獎結果，驗證就會不通過。',
      },
    },
    {
      type: 'steps',
      sort_order: 2,
      content: {
        h2: '怎麼運作',
        steps: [
          { title: '開獎前先公布驗證碼', description: '平台先產生驗證碼，並在開獎前公開。' },
          { title: '正常抽獎', description: '你抽到的號碼，就是你的抽獎結果。' },
          {
            title: '開獎後自己驗證',
            // 這三行要真的斷行：.lpv-fd 為此加了 white-space:pre-line
            // 不用 🟢🔴：部分手機的字型沒有這兩個 emoji，會顯示成空白方塊
            // （老闆截圖）。改用顏色強調：** ** 是主題綠、!! !! 是紅色
            description:
              '開獎完成後，公開完整結果。可自行驗證：\n' +
              '**驗證通過** → 結果沒有被修改\n' +
              '!!驗證不通過!! → 結果可能被修改',
          },
        ],
      },
    },
    {
      type: 'gallery',
      sort_order: 3,
      content: {
        h2: '在哪裡看',
        items: [
          { url: asset('/images/fairness/gallery-1.webp'), caption: '商品頁', media_type: 'image' },
          { url: asset('/images/fairness/gallery-2.webp'), caption: '我的倉庫', media_type: 'image' },
          { url: asset('/images/fairness/gallery-3.webp'), caption: '驗算頁', media_type: 'image' },
        ],
        callout: '開獎前看驗證碼，開獎後看結果並驗證。',
      },
    },
    {
      type: 'text',
      sort_order: 4,
      content: {
        h2: '哪些玩法適用',
        body:
          '**一番賞、抽卡、自製賞**\n' +
          '這些玩法都可以使用驗證碼進行驗證。\n\n' +
          '**轉蛋、盒玩**\n' +
          '每次抽獎都是獨立隨機，沒有固定的開獎結果，因此不適用。',
      },
    },
    {
      type: 'cta',
      sort_order: 5,
      content: {
        h2: '看完就去抽吧',
        text: '去看看可以抽什麼',
        url: '/',
        subtitle: '抽到的東西可以申請寄送，也可以回收成 G 幣。',
      },
    },
  ],
}

export default function FairnessContent() {
  /*
   * lp-center：這一頁的內文、步驟、說明框全部置中（老闆 2026-08-30）。
   * 樣式寫在 globals.css 並用這個外層 class 圈住 —— LpRenderer 的樣式是整包
   * 注入的，直接改它會動到所有活動頁，那些是圖文並排的檔期版型，置中會壞掉。
   */
  return (
    <div className="lp-center">
      <LpRenderer preset={FAIRNESS} />
    </div>
  )
}
