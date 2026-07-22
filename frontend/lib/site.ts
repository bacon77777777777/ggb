export function getSiteUrl() {
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_FRONTEND_URL ||
    process.env.SITE_URL ||
    ''

  const raw = (envUrl || 'https://www.ggb.com.tw').trim()
  if (!raw) return 'https://www.ggb.com.tw'
  return raw.replace(/\/+$/, '')
}

