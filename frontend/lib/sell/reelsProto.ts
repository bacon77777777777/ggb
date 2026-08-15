/*
 * 商城短影音 —— 第 0 期原型資料（docs/06_商城短影音開發文件.md §3）
 *
 * 老闆 2026-08-15：先做一天原型驗手感，不動資料表、不做上傳。
 * 五支影片是用 STG 商城商品主圖 ffmpeg 合成的直式 H.264（720×1280、8 秒、有一段低音量音效
 * 讓「開聲音」測得出來），放 R2 `reels-proto/`；掛的商品是 STG 上真的上架中商品（點得進 /sell/<id>）。
 *
 * 第一期接 DB（sell_posts / sell_reels_feed）時整支檔案換成 lib/sell/reels.ts，元件介面不變。
 */

export type Reel = {
  id: number;
  video: string;
  poster: string;
  duration: number;
  seller: { name: string; avatar: string; tier: string };
  caption: string;
  listing: { id: number; title: string; price: number; image: string };
  likes: number;
};

const R2 = 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev';

export const REELS_PROTO: Reel[] = [
  {
    id: 55,
    video: `${R2}/reels-proto/v_55.mp4`,
    poster: `${R2}/reels-proto/p_55.webp`,
    duration: 8,
    seller: { name: '123', avatar: '', tier: '新手' },
    caption: '三麗鷗應援手燈到貨實拍，五款都在，盒況良好，超商寄送當天出 ✨',
    listing: { id: 55, title: '三麗鷗 角色應援手燈｜二手轉讓', price: 820, image: `${R2}/products/ai-1784017080414-w6y4mzij9v.webp` },
    likes: 128,
  },
  {
    id: 58,
    video: `${R2}/reels-proto/v_58.mp4`,
    poster: `${R2}/reels-proto/p_58.webp`,
    duration: 8,
    seller: { name: 'test002', avatar: '', tier: '新手' },
    caption: '壽司去旅行 吊飾整套開箱，中トロ、大トロ都到齊了，要的私聊 🍣',
    listing: { id: 58, title: '壽司去旅行 造型吊飾｜二手轉讓', price: 1240, image: `${R2}/products/ai-1784017080447-tgueygocrm.webp` },
    likes: 96,
  },
  {
    id: 53,
    video: `${R2}/reels-proto/v_53.mp4`,
    poster: `${R2}/reels-proto/p_53.webp`,
    duration: 8,
    seller: { name: '123', avatar: '', tier: '新手' },
    caption: '卡比暖暖毛線公仔近拍，毛線質感真的很療癒，剩最後 2 組',
    listing: { id: 53, title: '星之卡比 暖暖毛線角色公仔｜二手轉讓', price: 540, image: `${R2}/products/ai-1784017060693-4c9v1cb36v4.webp` },
    likes: 210,
  },
  {
    id: 56,
    video: `${R2}/reels-proto/v_56.mp4`,
    poster: `${R2}/reels-proto/p_56.webp`,
    duration: 8,
    seller: { name: 'test002', avatar: '', tier: '新手' },
    caption: '鬼滅等待中公仔一組出清，未拆封，可面交可寄',
    listing: { id: 56, title: '鬼滅之刃 等待中公仔｜二手轉讓', price: 960, image: `${R2}/products/ai-1784017081156-uy24dzsva7.webp` },
    likes: 73,
  },
  {
    id: 51,
    video: `${R2}/reels-proto/v_51.mp4`,
    poster: `${R2}/reels-proto/p_51.webp`,
    duration: 8,
    seller: { name: '123', avatar: '', tier: '新手' },
    caption: '北極熊存錢筒夜燈，晚上開燈超可愛，二手九成新',
    listing: { id: 51, title: '北極熊存錢筒 夜燈公仔｜二手轉讓', price: 260, image: `${R2}/products/ai-1784017059551-2c15pyc6bix.webp` },
    likes: 45,
  },
];

export const findReel = (id: number) => REELS_PROTO.find((r) => r.id === id) || null;
