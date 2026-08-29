/**
 * 各機台主題可調的參數表（後台「參數設定」彈窗照這份長出滑桿）
 *
 * 只有真的吃參數的主題才列在這裡；沒列的主題彈窗會說「這個主題
 * 目前沒有可調參數」。之後哪個機台想開放調校，在這裡加一組就好，
 * 彈窗與存檔都不用改。
 *
 * 前台讀同一張表（machine_theme_params），key 必須一致。
 */

export interface ParamSpec {
  key: string
  label: string
  /** 分組標題，同組會排在一起 */
  group: string
  type: 'range' | 'toggle' | 'image'
  min?: number
  max?: number
  step?: number
  /** 顯示用的單位後綴 */
  unit?: string
  default: number | boolean | string
  hint?: string
}

export const MACHINE_PARAM_SPECS: Record<string, ParamSpec[]> = {
  /*
   * 抽卡：商品頁上半部的卡包 3D 輪播。
   *
   * 正反面圖留空時，前台照舊用內建的五款卡包圖（/images/card/pack/NNa|b.webp），
   * 輪播才不會五格長得一模一樣 —— 有設圖的商品才統一換成自己的卡包。
   */
  /*
   * ⚠ 這組是「商品頁上半部的卡包輪播」，不是任何一個開包演出的參數。
   * 原本掛在 card_pack（蓄力開卡包）底下 —— 於是在「單抽模式」關掉自動旋轉，
   * 連卡包模式的商品頁都跟著停（老闆 2026-08-19 回報）。拆成獨立的 card_showcase，
   * 兩種模式共用同一組，因為那本來就是同一個元件。
   */
  card_showcase: [
    { key: 'frontImage', label: '卡包正面', group: '卡包外觀', type: 'image', default: '',
      hint: '直式卡包，建議 62 × 116 比例（實體卡包尺寸）。留空用內建卡包圖。' },
    { key: 'backImage',  label: '卡包背面', group: '卡包外觀', type: 'image', default: '',
      hint: '玩家把卡包轉過去時看到的那面。留空用內建卡背。' },

    { key: 'autoSpin',   label: '自動翻轉', group: '展示動態', type: 'toggle', default: true,
      hint: '玩家停手一段時間後，主卡包自己慢慢轉。' },
    { key: 'spinSpeed',  label: '翻轉速度', group: '展示動態', type: 'range', min: 0.002, max: 0.03, step: 0.002, default: 0.008,
      hint: '每幀轉多少弧度。0.008 大約 13 秒轉一圈。' },
    { key: 'idleDelay',  label: '停手後延遲', group: '展示動態', type: 'range', min: 0, max: 4, step: 0.2, default: 1.2, unit: 's',
      hint: '玩家放開後等多久才開始自動轉，太短會跟手勢打架。' },
  ],

  /* 撕開封口（卡包模式的開包演出）。閃電粗細先前只能改程式碼，開成可調 */
  card_peel: [
    // 兩支影片都是正方形素材、置中疊在卡片上，大小一律以**卡牌高度**為基準：
    // 100% = 跟卡牌一樣高（素材是正方形，所以寬也等於卡牌高）。
    // 先前拿卡牌寬度當基準，數字看起來不大、算出來卻遠大於卡牌，電弧會甩到畫面邊緣。
    { key: 'vortexScale',   label: '漩渦大小', group: '大賞特效', type: 'range', min: 40, max: 300, step: 5, default: 100, unit: '%',
      hint: '卡片後面那圈漩渦（vortex.mp4）的大小，100% = 跟卡牌同高、置中。' },
    { key: 'vortexOffsetY', label: '漩渦位置', group: '大賞特效', type: 'range', min: -200, max: 200, step: 2, default: 0, unit: 'px',
      hint: '漩渦相對卡牌中心的上下位置。負值往上，0 = 正中。' },
    { key: 'energyScale',   label: '能量大小', group: '大賞特效', type: 'range', min: 40, max: 300, step: 5, default: 100, unit: '%',
      hint: '卡片周圍電弧（energy.mp4）的範圍，100% = 跟卡牌同高、置中。' },
    { key: 'energyOffsetY', label: '能量位置', group: '大賞特效', type: 'range', min: -200, max: 200, step: 2, default: 0, unit: 'px',
      hint: '電弧相對卡牌中心的上下位置。負值往上，0 = 正中。' },
    { key: 'fxOpacity',     label: '光效強度', group: '大賞特效', type: 'range', min: 0.2, max: 1.4, step: 0.05, default: 0.9,
      hint: '漩渦與能量的整體濃度。太高會蓋掉卡面細節。' },

    { key: 'dealStagger', label: '發牌間隔', group: '開包節奏', type: 'range', min: 40, max: 200, step: 10, default: 90, unit: 'ms',
      hint: '卡片一張張頂上來的間隔。' },
    { key: 'skipFlyMs',   label: 'SKIP 飛牌速度', group: '開包節奏', type: 'range', min: 20, max: 200, step: 5, default: 55, unit: 'ms',
      hint: '按 SKIP 時，跳過的牌一張張往右飛出去的間隔。越小飛越快。SKIP 一次只跳到「本包壓軸」，所以最多飛「每包張數−1」張。玩家開了閃電（快速模式）時完全不飛牌、瞬間到位，這格對他們無效。' },
    { key: 'flipDelay',   label: '翻牌延遲', group: '開包節奏', type: 'range', min: 200, max: 1200, step: 50, default: 500, unit: 'ms',
      hint: '發完牌到最上張自動翻面的等待時間。' },

    { key: 'peelCurl',    label: '封條捲曲半徑', group: '開包節奏', type: 'range', min: 20, max: 140, step: 1, default: 45, unit: 'px',
      hint: '封條被撕起來後捲成多大一捲（3D 圓柱，會捲向鏡頭）。數字越小捲越緊、越早繞回來蓋住自己；越大越像單純翹起一片。撕越長就繞越多圈，半徑不變。' },

    { key: 'sfxVolume',   label: '音效音量', group: '音效', type: 'range', min: 0, max: 1, step: 0.05, default: 1,
      hint: '撕包／發牌／翻牌／中獎音的總音量。各支音效之間的相對大小是固定的，這裡只調整體。0 = 靜音（玩家自己的靜音鍵另外算）。' },

    /* 背景流星（老闆 2026-08-29）。跟商品頁卡包輪播那四顆 CSS 流星是兩回事：
       那組是遠方慢慢飄的，這組是從畫面中心往外衝的星流，要的是速度感。
       顏色（白／紅／金）寫在前台 GgbPackRip 裡，不開成參數 —— 參數表只支援
       數值、開關與圖片，沒有色票型別。 */
    { key: 'starOn',         label: '背景流星', group: '背景流星', type: 'toggle', default: true,
      hint: '關掉就只剩原本的暗紫漸層底。玩家系統開了「減少動態效果」時一律不畫，這裡設什麼都一樣。' },
    { key: 'starCount',      label: '星點數量', group: '背景流星', type: 'range', min: 0, max: 800, step: 20, default: 500,
      hint: '手機（寬度 480px 以下）會自動砍到六成 —— 每顆星每幀要畫一條拖尾線，撕包當下還有另一張粒子畫布在跑，掉幀會掉在最關鍵的那幾秒。' },
    { key: 'starSpeed',      label: '衝出速度', group: '背景流星', type: 'range', min: 1, max: 10, step: 1, default: 5,
      hint: '星點從中心往外衝的速度。' },
    { key: 'starSize',       label: '星點大小', group: '背景流星', type: 'range', min: 0, max: 20, step: 1, default: 20 },
    { key: 'starTrail',      label: '拖尾長度', group: '背景流星', type: 'range', min: 0, max: 100, step: 5, default: 0, unit: '%',
      hint: '每一幀保留多少上一幀的殘影。0% = 細碎星塵（原型就是這個值）；往上加會把星點連成放射狀長線，100% 是滿畫面的光速隧道，會蓋掉卡片的金／紫光環。' },
    { key: 'starBrightness', label: '亮度',     group: '背景流星', type: 'range', min: 0, max: 100, step: 5, default: 100, unit: '%',
      hint: '⚠️ 這頁的底色是刻意壓深的，為的是讓金／紫的光環、閃電、火花是畫面上最亮的東西。流星開太亮會跟它們搶。覺得卡片浮不出來就從這格往下調。' },
  ],

  blindbox_mode5: [
    // 出貨節奏
    { key: 'stock',   label: '每格備貨', group: '出貨節奏', type: 'range', min: 0, max: 2,   step: 1,    default: 1,
      hint: '前排掉出後，後排補上來的存量。0 = 掉完就空著。' },
    { key: 'jitter',  label: '微差距',   group: '出貨節奏', type: 'range', min: 0, max: 400, step: 10,   default: 140, unit: 'ms',
      hint: '各格推出的時間差。全部同時掉會很假，錯開一點才像機械。' },
    { key: 'pushMs',  label: '推出時間', group: '出貨節奏', type: 'range', min: 150, max: 900, step: 10, default: 430, unit: 'ms' },
    { key: 'push',    label: '推出力道', group: '出貨節奏', type: 'range', min: 2.4, max: 6, step: 0.05, default: 3.3,
      hint: '太小盒子會倒回層板卡住（程式有下限保護，但手感會拖）。' },

    // 鏡頭與洞口
    { key: 'fov',     label: '視野',     group: '鏡頭與洞口', type: 'range', min: 20, max: 52,  step: 1,  default: 36, unit: '°' },
    { key: 'camUp',   label: '視點高度', group: '鏡頭與洞口', type: 'range', min: 0,  max: 520, step: 10, default: 300,
      hint: '越高越能看到盒子頂面。底圖不會變形（用離軸投影）。' },
    { key: 'lit',     label: '洞口補光', group: '鏡頭與洞口', type: 'range', min: 0, max: 2.5, step: 0.05, default: 1.2,
      hint: '取物口的前板只透光 25%，落進去的盒子靠這個補亮。' },
    { key: 'volume',  label: '音量',     group: '鏡頭與洞口', type: 'range', min: 0, max: 1,   step: 0.05, default: 0.8,
      hint: '機台音效總音量。0 = 靜音。' },

    // 物理手感
    { key: 'gravity', label: '重力',     group: '物理手感', type: 'range', min: 0.4, max: 3,    step: 0.05,  default: 1.5 },
    { key: 'rest',    label: '彈性',     group: '物理手感', type: 'range', min: 0,   max: 0.6,  step: 0.01,  default: 0.16 },
    { key: 'friction',label: '摩擦力',   group: '物理手感', type: 'range', min: 0,   max: 1,    step: 0.02,  default: 0.5 },
    { key: 'air',     label: '空氣阻力', group: '物理手感', type: 'range', min: 0,   max: 0.08, step: 0.002, default: 0.014 },
    { key: 'tumble',  label: '翻滾',     group: '物理手感', type: 'range', min: 0,   max: 1,    step: 0.05,  default: 0.75,
      hint: '盒子落定時翻到別的面的機率。0 = 一律正面朝上。' },

    // 效果開關
    { key: 'shake',   label: '鏡頭震動', group: '效果開關', type: 'toggle', default: true },
    { key: 'shadow',  label: '接觸陰影', group: '效果開關', type: 'toggle', default: true },
  ],
}

/** 取某主題的預設值（前台在讀不到設定時也用這份） */
export function defaultParams(theme: string): Record<string, number | boolean | string> {
  const specs = MACHINE_PARAM_SPECS[theme]
  if (!specs) return {}
  return Object.fromEntries(specs.map(s => [s.key, s.default]))
}
