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
          '把整檔的開獎表想成一份名單，驗證碼就是這份名單的**指紋**（技術上叫 SHA-256 雜湊）。\n\n' +
          '它有兩個特性：**同一份名單永遠算出同一組指紋**；**名單只要改動一個字，指紋就會完全不同**。\n\n' +
          '所以我們在**開賣時就先把指紋公布出來**，等於當眾把名單封進保險箱。這一檔結束後名單公開，' +
          '你可以**自己拿去算一次** —— 算出來的指紋必須跟開賣那天公布的一模一樣。對得上，代表中間沒被動過；' +
          '**對不上，代表我們改過東西，而且賴不掉**。',
      },
    },
    {
      type: 'steps',
      sort_order: 2,
      content: {
        h2: '怎麼運作',
        steps: [
          { title: '開賣前先封存', description: '商品一上架，哪個號碼對到哪個獎就**全部排定**，同時公布驗證碼。' },
          { title: '抽到的都有號碼', description: '每一件收進倉庫時都帶著它的號碼，**那就是你的收據**。' },
          { title: '完抽後公開對照', description: '這一檔抽完，**開獎表整份公開**。用你的號碼去查，就知道當初排給你的是不是這件。' },
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
        callout: '販售中只看得到驗證碼，**完抽後同一個位置會變成完整的開獎表**。',
      },
    },
    {
      type: 'text',
      sort_order: 4,
      content: {
        h2: '哪些玩法適用',
        body:
          '**一番賞、抽卡、自製賞**採用號碼封存，可以照上面的方式驗算。\n\n' +
          '**轉蛋與盒玩沒有號碼** —— 它們每一抽都是當下獨立隨機，不存在「開賣前就排好」這回事，' +
          '因此沒有可以事後比對的開獎表。',
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
  return <LpRenderer preset={FAIRNESS} />
}
