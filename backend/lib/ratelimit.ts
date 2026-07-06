import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)

const redis = hasRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null

const realLimiter = hasRedis
  ? new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(5, '10 m'),
      prefix: 'rl:payment',
    })
  : null

// 支付發起：同一 IP 每 10 分鐘最多 5 次（無 Redis 時本地開發直接放行）
export const paymentLimiter = {
  limit: async (_key: string) => {
    if (!realLimiter) return { success: true }
    return realLimiter.limit(_key)
  },
}

// 風控：同一用戶 1 小時內儲值次數計數（回傳累積次數，不封鎖）
export const rechargeRiskCounter = {
  increment: async (userId: string): Promise<number> => {
    if (!redis) return 0
    const key = `risk:recharge:${userId}`
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, 3600)
    return count as number
  },
}
