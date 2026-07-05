const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

try { require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') }) } catch {}
try { require('dotenv').config({ path: path.resolve(__dirname, '../.env') }) } catch {}

const DB_URL =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL

if (!DB_URL) {
  console.error('Missing SUPABASE_DB_URL. Please set it in .env.local.')
  process.exit(1)
}

function parseArgs(argv) {
  const args = { from: null, to: null, only: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--from') args.from = Number(argv[++i])
    else if (a === '--to') args.to = Number(argv[++i])
    else if (a === '--only') args.only = String(argv[++i] || '').trim()
  }
  return args
}

function getMigrationNumber(filename) {
  const m = path.basename(filename).match(/^(\d+)_/)
  return m ? Number(m[1]) : null
}

function runSql(filePath) {
  const url = new URL(DB_URL)
  const env = { ...process.env, PGPASSWORD: url.password }
  execSync(`psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "${filePath}"`, { env, stdio: 'inherit' })
}

async function migrate() {
  const { from, to, only } = parseArgs(process.argv.slice(2))
  const migrationsDir = path.join(__dirname, '../db/migrations')

  let files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => {
      const na = getMigrationNumber(a)
      const nb = getMigrationNumber(b)
      if (na == null && nb == null) return a.localeCompare(b)
      if (na == null) return 1
      if (nb == null) return -1
      if (na !== nb) return na - nb
      return a.localeCompare(b)
    })

  if (only) {
    files = files.filter(f => f === only || path.basename(f) === only)
    if (files.length === 0) { console.error(`Migration not found: ${only}`); process.exit(1) }
  } else {
    files = files.filter(f => {
      const n = getMigrationNumber(f)
      if (n == null) return false
      if (from != null && Number.isFinite(from) && n < from) return false
      if (to != null && Number.isFinite(to) && n > to) return false
      return true
    })
  }

  console.log(`Found ${files.length} migration(s) to apply.`)

  for (const f of files) {
    const sqlPath = path.join(migrationsDir, f)
    console.log(`Applying ${f}...`)
    try {
      runSql(sqlPath)
      console.log(`✓ ${f}`)
    } catch (err) {
      console.error(`✗ ${f} failed`)
      process.exit(1)
    }
  }

  console.log('Done.')
}

migrate()
