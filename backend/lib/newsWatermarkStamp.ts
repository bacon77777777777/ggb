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
 * 濃淡（白字 0.15 疊黑影 0.075）：老闆的標準是「**不要影響圖片閱讀**」。
 * 第一版 0.45/0.25 在三麗鷗那種粉嫩底圖上太搶，0.22 仍嫌重，定案 0.15。
 * 實測 0.15 在粉色淡圖上幾乎不干擾閱讀，在白底商品照上仍讀得到 ——
 * **白底靠的完全是底下那層黑影**，只留白字會直接消失，所以兩層不能省。
 * 再往下（試過 0.11）就快看不見了，失去浮水印的意義。
 *
 * 要改字或改濃淡就重跑產生器（字級 100、Helvetica bold、白字 0.15 疊
 * 黑影 0.075 錯開 1/14 字級、畫布 9.2 字寬、trim 去透明邊）：
 *
 *   const svg = `<svg ...><text ... fill="#000" fill-opacity="0.075">www.ggb.com.tw</text>` +
 *               `<text ... fill="#fff" fill-opacity="0.15">www.ggb.com.tw</text></svg>`
 *   const png = await sharp(Buffer.from(svg)).trim({ threshold: 1 })
 *     .png({ compressionLevel: 9, palette: true, colours: 64 }).toBuffer()
 *   console.log(png.toString('base64'))
 */
export const WM_STAMP_BASE64 =
  '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'
