/**
 * 產生 iOS 啟動畫面資產（Splash.imageset/splash.jpg）
 *
 * 用法：node scripts/make_splash.mjs
 * 來源：assets/splash-source.jpg（換主視覺就換這張，然後重跑）
 *
 * ── 為什麼是 2732x2732 的正方形 ──
 * 一張圖要餵所有機型（iPhone 直式到 iPad 橫式），系統用 scaleAspectFill
 * 從中間往外裁。正方形是唯一能同時滿足兩個方向的形狀。
 * 代價是**邊緣一定會被裁掉**：iPhone 16 上只看得到中央 1259px 寬那一條，
 * 主視覺的重要內容必須落在中央，出了框在某些機型上就會消失。
 *
 * ── 左右為什麼要墊模糊背景 ──
 * 主圖是直式（9:16），撐滿正方形的高度之後左右各差約 600px。
 * 那兩條在直式手機上看不到，但 iPad 橫式會露出來 —— 用純色會出現一條
 * 銳利的分界線，用同一張圖放大模糊則接得順。
 *
 * ── 版本號不在這裡 ──
 * 版本號是 LaunchScreen.storyboard 上的 UILabel，不是燒在圖上的。
 * 燒在圖上的字會跟著圖一起被裁切（iPad 橫式就看不到了），而 storyboard
 * 的 label 綁 safe area，任何機型都準確落在螢幕正下方。
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(here, '..');
const REPO = path.resolve(MOBILE, '..');

// mobile/ 不需要為了這支腳本背一份 sharp，借同一個 repo 裡已經有的
const sharp = require(path.join(REPO, 'backend/node_modules/sharp'));

const SRC = path.join(MOBILE, 'assets/splash-source.jpg');
const OUT_DIR = path.join(MOBILE, 'ios/App/App/Assets.xcassets/Splash.imageset');
const SIDE = 2732;

const meta = await sharp(SRC).metadata();
const fgH = SIDE;
const fgW = Math.round((meta.width / meta.height) * fgH);

const fg = await sharp(SRC).resize(fgW, fgH, { kernel: 'lanczos3' }).png().toBuffer();
const bg = await sharp(SRC)
  .resize(SIDE, SIDE, { fit: 'cover', kernel: 'lanczos3' })
  .blur(60)
  .modulate({ brightness: 1.02 })
  .png()
  .toBuffer();

const out = await sharp(bg)
  .composite([{ input: fg, left: Math.round((SIDE - fgW) / 2), top: 0 }])
  .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
  .toBuffer();

fs.writeFileSync(path.join(OUT_DIR, 'splash.jpg'), out);

/*
 * Single Scale（Contents.json 不寫 scale）：2732x2732 已經超過任何機型所需，
 * 不必再切 1x/2x/3x 三份一模一樣的檔案。深色模式指向同一張 ——
 * 品牌啟動頁不隨系統外觀換臉。
 */
fs.writeFileSync(path.join(OUT_DIR, 'Contents.json'), JSON.stringify({
  images: [
    { idiom: 'universal', filename: 'splash.jpg' },
    { idiom: 'universal', filename: 'splash.jpg', appearances: [{ appearance: 'luminosity', value: 'dark' }] },
  ],
  info: { version: 1, author: 'xcode' },
}, null, 2) + '\n');

const scale = (fgH / meta.height).toFixed(2);
console.log(`來源 ${meta.width}x${meta.height} → 主圖 ${fgW}x${fgH}（${scale} 倍）`);
console.log(`輸出 splash.jpg ${SIDE}x${SIDE}  ${(out.length / 1024).toFixed(0)}KB`);
console.log(`直式手機可視寬 ${Math.round(SIDE * 0.461)}px（主圖左右各裁 ${Math.round((fgW - SIDE * 0.461) / 2)}px）`);
