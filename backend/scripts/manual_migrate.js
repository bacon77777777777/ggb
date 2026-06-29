const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
} catch (e) {
  console.error('Failed to load .env.local:', e);
}
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch (e) {
  console.error('Failed to load .env:', e);
}

function parseArgs(argv) {
  const args = {
    from: null,
    to: null,
    only: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') args.from = Number(argv[++i]);
    else if (a === '--to') args.to = Number(argv[++i]);
    else if (a === '--only') args.only = String(argv[++i] || '').trim();
  }

  return args;
}

function getMigrationNumber(filename) {
  const base = path.basename(filename);
  const m = base.match(/^(\d+)_/);
  return m ? Number(m[1]) : null;
}

async function migrate() {
  const connectionString =
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;

  if (!connectionString) {
    console.error('Missing SUPABASE_DB_URL (or DATABASE_URL / POSTGRES_URL). Please check your .env files.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  const { from, to, only } = parseArgs(process.argv.slice(2));
  const migrationsDir = path.join(__dirname, '../db/migrations');

  try {
    await client.connect();

    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found: ${migrationsDir}`);
    }

    let files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => {
        const na = getMigrationNumber(a);
        const nb = getMigrationNumber(b);
        if (na == null && nb == null) return a.localeCompare(b);
        if (na == null) return 1;
        if (nb == null) return -1;
        if (na !== nb) return na - nb;
        return a.localeCompare(b);
      });

    if (only) {
      files = files.filter((f) => f === only || path.basename(f) === only);
      if (files.length === 0) {
        throw new Error(`Migration not found with --only: ${only}`);
      }
    } else {
      files = files.filter((f) => {
        const n = getMigrationNumber(f);
        if (n == null) return false;
        if (from != null && Number.isFinite(from) && n < from) return false;
        if (to != null && Number.isFinite(to) && n > to) return false;
        return true;
      });
    }

    console.log(`Found ${files.length} migration(s) to apply.`);

    for (const f of files) {
      const sqlPath = path.join(migrationsDir, f);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      console.log(`Applying ${f}...`);
      await client.query(sql);
    }

    console.log('All selected migrations applied successfully.');

  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

migrate();
