import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import fs from 'fs'
import path from 'path'

const toSafeConnMeta = (raw: string) => {
  try {
    const u = new URL(raw)
    return {
      host: u.hostname,
      port: u.port || '',
      user: u.username || '',
      database: (u.pathname || '').replace(/^\//, ''),
    }
  } catch {
    return null
  }
}

export async function POST() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL
    if (!connectionString) {
      return NextResponse.json(
        { error: 'Missing SUPABASE_DB_URL (or DATABASE_URL) for direct DB migrations' },
        { status: 500 }
      )
    }

    const migrationFiles = ['179_sell_non_custodial.sql', '181_sell_listing_views.sql', '183_sell_escrow_payments.sql']

    const { Client } = require('pg') as any
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

    try {
      await client.connect()
      for (const f of migrationFiles) {
        const sqlPath = path.resolve(process.cwd(), 'db/migrations', f)
        if (!fs.existsSync(sqlPath)) continue
        const sql = fs.readFileSync(sqlPath, 'utf8')
        await client.query(sql)
      }
    } finally {
      await client.end()
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    const msg = String(e?.message || '')
    const code = String(e?.code || '')
    if (code === 'ENOTFOUND' || msg.includes('getaddrinfo ENOTFOUND')) {
      return NextResponse.json(
        {
          error:
            'DB 連線失敗（DNS 找不到主機）。請到 Supabase Dashboard → Project Settings → Database → Connection string，改用 Transaction/Pooler 的 postgresql 連線字串（通常是 aws-0-xxx.pooler.supabase.com），不要用 db.<ref>.supabase.co。',
        },
        { status: 500 }
      )
    }

    if (msg.includes('password authentication failed')) {
      const meta = toSafeConnMeta(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || '')
      const extra = meta
        ? `（目前嘗試連線：user=${meta.user || '-'} host=${meta.host || '-'} port=${meta.port || '-'} db=${meta.database || '-'}）`
        : ''

      return NextResponse.json(
        {
          error:
            'DB 密碼驗證失敗。請確認你在 Vercel 設定的 SUPABASE_DB_URL 是 Supabase 的 Transaction pooler 字串，且 user 必須是「postgres.<projectRef>」（不是單純 postgres），並把 [YOUR-PASSWORD] 換成 Database password（若含特殊字元需 URL encode）。' +
            extra,
        },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: e?.message || 'Bootstrap failed' }, { status: 500 })
  }
}
