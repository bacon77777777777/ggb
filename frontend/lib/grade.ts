/**
 * 賞等的「大獎」判斷 —— 倉庫格子與商品頁品項總覽共用。
 *
 * 大獎的賞等膠囊用實色、一般版用灰底，才不會最不值錢的喊最大聲（老闆 2026-08-24）。
 * 原本寫在 app/profile/page.tsx 裡，2026-09-03 商品頁品項總覽改成倉庫那種格子後
 * 兩邊都要用，搬到這裡。規則沒改。
 */
export const MAJOR_LEVELS = ['SP賞', 'S賞', 'A賞', 'B賞', 'C賞', 'SP', 'S', 'A', 'B', 'C', 'LAST ONE', '最後賞'];

/** 賞等的「字母」部分：'A賞'→'A'、'A賞 限定色'→'A'、'sp賞'→'SP' */
export const gradeBase = (grade: string | undefined | null) => {
  if (!grade) return '';
  let base = grade.trim();
  const prizeIndex = base.indexOf('賞');
  if (prizeIndex !== -1) base = base.slice(0, prizeIndex);
  if (base.includes(' ')) base = base.split(' ')[0];
  return base.toUpperCase();
};

export const isMajorGrade = (grade: string | undefined | null) => {
  if (!grade) return false;
  const trimmed = grade.trim();
  if (!trimmed) return false;
  const upper = trimmed.toUpperCase();
  if (upper === 'LAST ONE' || trimmed === '最後賞') return true;
  if (MAJOR_LEVELS.includes(trimmed) || MAJOR_LEVELS.includes(upper)) return true;
  return MAJOR_LEVELS.includes(gradeBase(trimmed));
};

/** 最後賞（不進品項總覽的表，另有自己的卡片） */
export const isLastOneLevel = (grade: string | undefined | null) =>
  !!grade && (grade === 'Last One' || grade === 'LAST ONE' || grade.includes('最後賞'));

/** A賞（商品頁品項總覽只有這一級用大圖格子，老闆 2026-09-03） */
export const isAGrade = (grade: string | undefined | null) => gradeBase(grade) === 'A';
