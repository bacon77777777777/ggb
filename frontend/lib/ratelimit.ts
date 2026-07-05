import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)

// 本地開發未設定 Redis 時，用 no-op limiter（永遠放行）
const noopLimiter = {
  limit: async (_key: string) => ({ success: true, limit: 999, remaining: 999, reset: 0, pending: Promise.resolve() }),
}

function makeLimiter(options: { window: number; unit: string; requests: number; prefix: string }) {
  if (!hasRedis) return noopLimiter as unknown as Ratelimit

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(options.requests, `${options.window} ${options.unit}` as any),
    prefix: options.prefix,
  })
}

// 抽獎：同一用戶每 3 秒最多 3 次（防連點）
export const drawLimiter = makeLimiter({ requests: 3, window: 3, unit: 's', prefix: 'rl:draw' })

// 登入 OTP 請求：同一 IP 每 15 分鐘最多 5 次
export const authLimiter = makeLimiter({ requests: 5, window: 15, unit: 'm', prefix: 'rl:auth' })
