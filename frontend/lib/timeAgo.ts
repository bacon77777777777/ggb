export function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)         return '剛剛';
  if (diff < 3600)       return `${Math.floor(diff / 60)} 分鐘前`;
  if (diff < 86400)      return `${Math.floor(diff / 3600)} 小時前`;
  if (diff < 86400 * 7)  return `${Math.floor(diff / 86400)} 天前`;
  return new Date(dateStr).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
}
