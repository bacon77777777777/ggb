'use client';

import { motion } from 'framer-motion';
import { BouncingCapsule } from './BouncingCapsule';

/**
 * 區塊型等待動畫（不是滿版的那種，滿版用 ProductLoadingScreen）
 *
 * 這支原本叫 IpLoader，內容是八隻 IP 角色輪播。老闆 2026-08-30：
 * 「為什麼還有 IP 角色 loading，都要改成彈跳轉蛋」—— 全站等待動畫統一成
 * 下拉更新那顆球（BouncingCapsule）。名字一起改掉，免得下一個人照著名字
 * 以為這裡還是角色。
 */
export function GachaLoader({ dark = false, size = 'md' }: {
  /** 暗色背景：文字改用 white/60 */
  dark?: boolean;
  /** sm = 小區塊（球 28px）、md = 一般（球 40px） */
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <BouncingCapsule size={size === 'sm' ? 28 : 40} />
      <motion.span
        className={`text-xs font-black tracking-widest ${dark ? 'text-white/60' : 'text-neutral-400 dark:text-neutral-500'}`}
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        載入中
      </motion.span>
    </div>
  );
}
