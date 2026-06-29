export function getSiteUrl() {
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_FRONTEND_URL ||
    process.env.SITE_URL ||
    ''

  const raw = (envUrl || 'https://gachago.shop').trim()
  if (!raw) return 'https://gachago.shop'
  return raw.replace(/\/+$/, '')
}

