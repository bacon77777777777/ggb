export function sanitizeImageUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/\)+$/, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('/')) return cleaned;
  try {
    const url = new URL(cleaned);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}
