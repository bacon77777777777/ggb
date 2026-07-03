import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// 抽獎：同一用戶每 3 秒最多 3 次（防連點）
export const drawLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '3 s'),
  prefix: 'rl:draw',
})

// 登入 OTP 請求：同一 IP 每 15 分鐘最多 5 次
export const authLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '15 m'),
  prefix: 'rl:auth',
})
