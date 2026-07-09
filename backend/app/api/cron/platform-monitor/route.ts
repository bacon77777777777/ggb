import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { r2, R2_BUCKET } from '@/lib/r2'
import { ListObjectsV2Command } from '@aws-sdk/client-s3'

export const runtime = 'nodejs'
export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// Supabase DB 大小（直接查 pg，不需額外 token）
// ─────────────────────────────────────────────────────────────────────────────
async function fetchSupabaseStatus() {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.rpc('execute_readonly_sql', {
      sql: `SELECT round(pg_database_size(current_database()) / 1024.0 / 1024.0, 2) AS mb`
    })
    if (error || !data?.[0]) return { db_mb: null, status: 'error' as const }
    const mb = Number(data[0].mb)
    const pct = mb / 500 * 100
    return {
      db_mb: mb,
      status: pct > 90 ? 'error' : pct > 75 ? 'warning' : 'ok' as 'ok' | 'warning' | 'error',
    }
  } catch {
    return { db_mb: null, status: 'error' as const }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare R2 — 用已有 S3 client 列出所有物件算總大小
// ─────────────────────────────────────────────────────────────────────────────
async function fetchR2Status() {
  try {
    let objects = 0
    let sizeBytes = 0
    let continuationToken: string | undefined

    do {
      const res = await r2.send(new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }))
      for (const obj of res.Contents ?? []) {
        objects++
        sizeBytes += obj.Size ?? 0
      }
      continuationToken = res.NextContinuationToken
    } while (continuationToken)

    const sizeMb = sizeBytes / 1024 / 1024
    const pct = sizeMb / (10 * 1024) * 100  // 10 GB 免費額度
    return {
      objects,
      size_mb: Math.round(sizeMb * 100) / 100,
      status: pct > 90 ? 'error' : pct > 75 ? 'warning' : 'ok' as 'ok' | 'warning' | 'error',
    }
  } catch {
    return { objects: null, size_mb: null, status: 'error' as const }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vercel — 需要 VERCEL_TOKEN + VERCEL_TEAM_ID
// ─────────────────────────────────────────────────────────────────────────────
async function fetchVercelStatus() {
  const token = process.env.VERCEL_TOKEN
  if (!token) return { status: 'unknown' as const, state: null, deployed_at: null, url: null }

  try {
    const teamId = process.env.VERCEL_TEAM_ID
    const qs = teamId ? `?teamId=${teamId}&limit=1` : '?limit=1'
    const res = await fetch(`https://api.vercel.com/v6/deployments${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { status: 'error' as const, state: null, deployed_at: null, url: null }

    const data = await res.json()
    const dep = data.deployments?.[0]
    if (!dep) return { status: 'unknown' as const, state: null, deployed_at: null, url: null }

    const state: string = dep.state ?? ''
    return {
      status: state === 'READY' ? 'ok' : state === 'ERROR' ? 'error' : 'warning' as 'ok' | 'warning' | 'error' | 'unknown',
      state,
      deployed_at: dep.createdAt ? new Date(dep.createdAt).toISOString() : null,
      url: dep.url ? `https://${dep.url}` : null,
    }
  } catch {
    return { status: 'error' as const, state: null, deployed_at: null, url: null }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub — 需要 GITHUB_TOKEN + GITHUB_REPO（e.g. "bacon77777777/ggb"）
// ─────────────────────────────────────────────────────────────────────────────
async function fetchGithubStatus() {
  const token = process.env.GITHUB_TOKEN
  const repo  = process.env.GITHUB_REPO
  if (!token || !repo) return { status: 'unknown' as const, conclusion: null, sha: null, committed_at: null }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/runs?per_page=1&branch=main`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return { status: 'error' as const, conclusion: null, sha: null, committed_at: null }

    const data = await res.json()
    const run = data.workflow_runs?.[0]
    if (!run) return { status: 'unknown' as const, conclusion: null, sha: null, committed_at: null }

    const conclusion: string | null = run.conclusion
    return {
      status: conclusion === 'success' ? 'ok'
        : conclusion === 'failure' ? 'error'
        : conclusion === null ? 'warning'   // in_progress
        : 'ok' as 'ok' | 'warning' | 'error' | 'unknown',
      conclusion,
      sha: run.head_sha?.slice(0, 7) ?? null,
      committed_at: run.updated_at ?? null,
    }
  } catch {
    return { status: 'error' as const, conclusion: null, sha: null, committed_at: null }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LINE 推播
// ─────────────────────────────────────────────────────────────────────────────
async function pushLine(message: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  const targetId = process.env.NOTIFY_TARGET_ID
  const targetType = process.env.NOTIFY_TARGET_TYPE ?? 'user'
  if (!token || !targetId) return

  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      to: targetId,
      messages: [{ type: 'text', text: message }],
    }),
  }).catch(() => {})
}

// ─────────────────────────────────────────────────────────────────────────────
// 主 Handler
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [supabase, r2Status, vercel, github] = await Promise.all([
    fetchSupabaseStatus(),
    fetchR2Status(),
    fetchVercelStatus(),
    fetchGithubStatus(),
  ])

  // 整體狀態
  const statuses = [supabase.status, r2Status.status, vercel.status, github.status]
  const overall = statuses.includes('error') ? 'error'
    : statuses.includes('warning') ? 'warning'
    : 'ok'

  // 告警訊息
  const alerts: string[] = []
  if (supabase.status === 'error')   alerts.push(`Supabase DB 接近上限：${supabase.db_mb} MB / 500 MB`)
  if (supabase.status === 'warning') alerts.push(`Supabase DB 用量偏高：${supabase.db_mb} MB / 500 MB`)
  if (r2Status.status === 'error')   alerts.push(`R2 儲存接近上限：${r2Status.size_mb} MB / 10,240 MB`)
  if (vercel.status === 'error')     alerts.push(`Vercel 最新部署失敗：${vercel.state}`)
  if (github.status === 'error')     alerts.push(`GitHub CI 失敗：${github.conclusion}`)

  // 寫入 DB
  const db = getSupabaseAdmin()
  await db.from('platform_monitor_logs').insert({
    supabase_db_mb:       supabase.db_mb,
    supabase_status:      supabase.status,
    r2_objects:           r2Status.objects,
    r2_size_mb:           r2Status.size_mb,
    r2_status:            r2Status.status,
    vercel_status:        vercel.status,
    vercel_deploy_state:  vercel.state,
    vercel_deployed_at:   vercel.deployed_at,
    vercel_deploy_url:    vercel.url,
    github_status:        github.status,
    github_ci_conclusion: github.conclusion,
    github_commit_sha:    github.sha,
    github_committed_at:  github.committed_at,
    overall_status:       overall,
    alerts:               alerts,
  })

  // 有問題才推 LINE
  if (overall !== 'ok') {
    const statusIcon = overall === 'error' ? '🔴' : '🟡'
    const twTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })
    const msg = [
      `${statusIcon} 平台監控警報 ${twTime}`,
      '',
      ...alerts,
      '',
      `Supabase DB：${supabase.db_mb ?? '—'} MB`,
      `R2 儲存：${r2Status.size_mb ?? '—'} MB（${r2Status.objects ?? '—'} 檔）`,
      `Vercel：${vercel.state ?? vercel.status}`,
      `GitHub CI：${github.conclusion ?? github.status}`,
    ].join('\n')
    await pushLine(msg)
  }

  return NextResponse.json({ ok: true, overall, alerts })
}
