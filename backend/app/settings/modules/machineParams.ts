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
  card_pack: [
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
