/**
 * 格式化時間為 YYYY-MM-DD HH:mm:ss 格式
 * @param dateTime 時間字符串，可能是多種格式
 * @returns 格式化後的時間字符串 YYYY-MM-DD HH:mm:ss，如果輸入為空則返回 '-'
 */
export function formatDateTime(dateTime: string | null | undefined): string {
  if (!dateTime) return '-'
  
  // 如果已經是完整格式 YYYY-MM-DD HH:mm:ss，直接返回
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateTime)) {
    return dateTime
  }
  
  // 如果是 YYYY-MM-DD HH:mm 格式，補上秒數
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(dateTime)) {
    return `${dateTime}:00`
  }
  
  // 如果是 YYYY-MM-DD 格式，補上時間
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTime)) {
    return `${dateTime} 00:00:00`
  }
  
  // 嘗試解析其他格式
  try {
    const date = new Date(dateTime.replace(/\s/g, 'T'))
    if (isNaN(date.getTime())) {
      return dateTime // 無法解析，返回原值
    }
    
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  } catch (e) {
    return dateTime // 解析失敗，返回原值
  }
}
