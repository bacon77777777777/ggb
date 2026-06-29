'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

function loadEnv() {
  const envLocal = path.resolve(process.cwd(), 'backend/.env.local');
  const envFallback = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envLocal)) {
    dotenv.config({ path: envLocal });
  } else if (fs.existsSync(envFallback)) {
    dotenv.config({ path: envFallback });
  } else {
    dotenv.config();
  }
}

function listFilesRecursive(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile()) out.push(full);
    }
  }
  return out;
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.webp') return 'image/webp';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function withRetry(fn, { retries, baseDelayMs }) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === retries) break;
      const delay = baseDelayMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw lastErr;
}

async function main() {
  loadEnv();

  const dir = process.argv[2];
  const bucket = process.argv[3] || 'products';
  const prefix = process.argv[4] || '';

  if (!dir) {
    console.error('Usage: node backend/scripts/upload_dir_to_supabase_storage.js <dir> [bucket=products] [prefix]');
    process.exit(1);
  }
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`Not a directory: ${dir}`);
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const allFiles = listFilesRecursive(dir);
  const files = allFiles.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return ['.webp', '.png', '.jpg', '.jpeg', '.gif'].includes(ext);
  });

  const concurrency = Math.max(1, Math.min(16, Number(process.env.UPLOAD_CONCURRENCY || '8')));
  const retries = Math.max(0, Math.min(10, Number(process.env.UPLOAD_RETRIES || '4')));
  const baseDelayMs = Math.max(100, Math.min(5000, Number(process.env.UPLOAD_RETRY_BASE_MS || '250')));

  console.log(`Dir: ${dir}`);
  console.log(`Bucket: ${bucket}`);
  console.log(`Prefix: ${prefix || '(none)'}`);
  console.log(`Files: ${files.length}/${allFiles.length}`);
  console.log(`Concurrency: ${concurrency}`);

  let cursor = 0;
  let ok = 0;
  let fail = 0;
  const failed = [];

  const startedAt = Date.now();

  const uploadOne = async (filePath) => {
    const rel = path.relative(dir, filePath).split(path.sep).join('/');
    const objectPath = prefix ? `${prefix.replace(/\/$/, '')}/${rel}` : rel;
    const contentType = guessContentType(filePath);
    const body = fs.readFileSync(filePath);

    await withRetry(async () => {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(objectPath, body, { contentType, upsert: true });
      if (error) throw new Error(error.message);
    }, { retries, baseDelayMs });
  };

  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= files.length) return;
      const filePath = files[idx];
      try {
        await uploadOne(filePath);
        ok += 1;
      } catch (e) {
        fail += 1;
        failed.push({ file: filePath, error: String(e && e.message ? e.message : e) });
      }

      const done = ok + fail;
      if (done % 50 === 0 || done === files.length) {
        const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const rate = Math.round((done / elapsedSec) * 10) / 10;
        console.log(`Progress: ${done}/${files.length} (ok=${ok}, fail=${fail}, rate=${rate}/s)`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, files.length || 1) }, () => worker()));

  const summary = {
    dir,
    bucket,
    prefix,
    total: files.length,
    ok,
    fail,
    failed,
    finishedAt: new Date().toISOString(),
  };
  const summaryPath = path.join(dir, 'upload_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`Done. ok=${ok}, fail=${fail}`);
  console.log(`Summary: ${summaryPath}`);

  if (fail > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
