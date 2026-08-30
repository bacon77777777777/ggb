/**
 * 網址浮水印的文字圖章（818×101，透明底，不透明度已烙進圖）
 *
 * 為什麼是內嵌的 PNG，而不是 SVG <text>：
 *
 * 2026-08-29 第一版用 SVG `<text>` 排字，本機（Mac，有 Helvetica）看起來完全正常，
 * 上到 STG 之後**整張圖沒有任何浮水印**。逐像素比對 R2 成品與原圖：明顯不同的
 * 像素 4.8%（全部來自右下角那塊 logo 白墊），沒蓋 logo 的左上區塊亮度差
 * 每子像素 −0.24 —— 白色半透明文字蓋上去必然讓亮度上升，它沒有。
 *
 * 原因是 Vercel 的 serverless 執行環境沒有系統字型：librsvg 找不到字就
 * **畫一片空白、不拋錯**，而 stampUrlWatermark 的 catch 是「失敗回原圖」，
 * 於是整條路徑靜靜地什麼都沒做，沒有任何錯誤訊息。
 *
 * 改成把文字先在本機排好、存成 PNG 內嵌進原始碼，執行期只做縮放／旋轉／平鋪，
 * 完全不碰字型。這樣本機預覽與線上成品保證長得一樣。
 *
 * **畫布寬度要給足**：`www.ggb.com.tw` 在 Helvetica bold 約 8.1 個字寬，
 * 第一版只給 7.6，左右各被切掉一點 —— 最後那個 w 少了三分之一，
 * 玩家讀起來變成 `www.ggb.com.tv`（老闆截圖回報）。現在給 9.2 再 trim。
 *
 * 濃淡：**單層白字 0.05，沒有陰影**（老闆 2026-08-30：「看不到但有一點點這樣最好」；
 * 陰影是 2026-08-29 拿掉的 ——「傾斜浮水印看起來很不舒服，就靠白底淡淡就好」）。
 *
 * 濃淡演進：0.45/0.25 → 0.22/0.11 → 0.15/0.075 → 白字 0.18 → 白字 0.05。
 *
 * **已知取捨**：黑影那層原本是白底圖片上唯一撐得住的東西。拿掉之後，
 * 淺色底圖（白底商品照、粉嫩宣傳圖）上的浮水印幾乎看不見，只有深色圖
 * 讀得出來。這是老闆看過實際成品後選的方向 —— 要改回「淺色圖也看得到」，
 * 正解不是把黑影加回來，而是依圖片亮度自動選白字或深色字（尚未實作）。
 *
 * 要改字或改濃淡就重跑產生器（字級 100、Helvetica bold、單層白字 0.05、畫布 9.2 字寬、trim 去透明邊）：
 *
 *   const svg = `<svg ...><text ... fill="#fff" fill-opacity="0.05">www.ggb.com.tw</text></svg>`
 *   const png = await sharp(Buffer.from(svg)).trim({ threshold: 1 })
 *     .png({ compressionLevel: 9, palette: true, colours: 64 }).toBuffer()
 *   console.log(png.toString('base64'))
 */
export const WM_STAMP_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAysAAABeBAMAAADRfpaAAAAAJ1BMVEVMaXH/////////////////////////////////////////' +
  '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'
