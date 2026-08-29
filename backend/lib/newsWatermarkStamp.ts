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
 * 濃淡：**單層白字 0.18，沒有陰影**（老闆 2026-08-29 指定：
 * 「傾斜浮水印看起來很不舒服，陰影移除，就靠白底淡淡就好」）。
 *
 * 濃淡演進：0.45/0.25 → 0.22/0.11 → 0.15/0.075 → 單層白字 0.18。
 *
 * **已知取捨**：黑影那層原本是白底圖片上唯一撐得住的東西。拿掉之後，
 * 淺色底圖（白底商品照、粉嫩宣傳圖）上的浮水印幾乎看不見，只有深色圖
 * 讀得出來。這是老闆看過實際成品後選的方向 —— 要改回「淺色圖也看得到」，
 * 正解不是把黑影加回來，而是依圖片亮度自動選白字或深色字（尚未實作）。
 *
 * 要改字或改濃淡就重跑產生器（字級 100、Helvetica bold、單層白字 0.18、畫布 9.2 字寬、trim 去透明邊）：
 *
 *   const svg = `<svg ...><text ... fill="#fff" fill-opacity="0.18">www.ggb.com.tw</text></svg>`
 *   const png = await sharp(Buffer.from(svg)).trim({ threshold: 1 })
 *     .png({ compressionLevel: 9, palette: true, colours: 64 }).toBuffer()
 *   console.log(png.toString('base64'))
 */
export const WM_STAMP_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAysAAABeBAMAAADRfpaAAAAAMFBMVEX///9MaXH/////////////////////////////////////' +
  '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'
