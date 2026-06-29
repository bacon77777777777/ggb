'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

function loadEnv() {
  const envLocal = path.resolve(process.cwd(), 'backend/.env.local');
  if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
  else dotenv.config();
}

function norm(val) {
  return String(val ?? '').trim().replace(/\)+$/, '');
}

async function head(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

function listFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    const ents = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of ents) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) out.push(full);
    }
  }
  return out;
}

async function main() {
  loadEnv();
  const sourceDir = process.argv[2];
  const bucket = process.argv[3] || 'products';
  if (!sourceDir) {
    console.error('Usage: node backend/scripts/sync_missing_db_images_from_dir.js <sourceDir> [bucket=products]');
    process.exit(1);
  }
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    console.error('Source dir not found:', sourceDir);
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing env for supabase');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const buildUrl = (s) => {
    const v = norm(s);
    if (!v) return null;
    if (v.startsWith('http://') || v.startsWith('https://')) return v;
    if (v.startsWith('/')) return null;
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${v}`;
  };

  const { data: products } = await supabase.from('products').select('id,name,image_url').limit(5000);
  const { data: prizes } = await supabase.from('product_prizes').select('id,product_id,level,name,image_url').limit(50000);

  const targets = new Set();
  for (const p of products || []) {
    const v = norm(p.image_url);
    if (v && !v.startsWith('http') && !v.startsWith('/')) targets.add(v);
  }
  for (const r of prizes || []) {
    const v = norm(r.image_url);
    if (v && !v.startsWith('http') && !v.startsWith('/')) targets.add(v);
  }

  const existingOk = new Set();
  const missing = [];
  const concurrency = 24;
  let cur = 0;
  const arr = Array.from(targets);
  const worker = async () => {
    while (true) {
      const i = cur++;
      if (i >= arr.length) return;
      const v = arr[i];
      const url = buildUrl(v);
      if (!url) continue;
      const ok = await head(url);
      if (ok) existingOk.add(v);
      else missing.push(v);
      if ((i + 1) % 300 === 0) console.log(`Checked ${i + 1}/${arr.length} missing=${missing.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, arr.length || 1) }, () => worker()));

  const files = listFiles(sourceDir);
  const byName = new Map();
  for (const f of files) {
    byName.set(path.basename(f), f);
  }
  // Also map "strip hash suffix" name -> file
  for (const f of files) {
    const base = path.basename(f);
    const m = base.match(/^(.*)_[0-9a-fA-F]{6}(\.[a-zA-Z0-9]+)$/);
    if (m) {
      const stripped = m[1] + m[2];
      if (!byName.has(stripped)) byName.set(stripped, f);
    }
  }

  let uploaded = 0;
  let failed = 0;
  const failures = [];
  for (const name of missing) {
    const source = byName.get(name) || (name.replace(/_[0-9a-fA-F]{6}(\.[a-zA-Z0-9]+)$/, '$1') && byName.get(name.replace(/_[0-9a-fA-F]{6}(\.[a-zA-Z0-9]+)$/, '$1')));
    if (!source) {
      failures.push({ name, error: 'source_not_found' });
      failed++;
      continue;
    }
    try {
      const body = fs.readFileSync(source);
      const ext = path.extname(name).toLowerCase();
      const contentType = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
      const { error } = await supabase.storage.from(bucket).upload(name, body, { upsert: true, contentType });
      if (error) throw new Error(error.message);
      uploaded++;
    } catch (e) {
      failures.push({ name, error: String(e && e.message ? e.message : e) });
      failed++;
    }
  }

  const summary = {
    totalDbRefs: arr.length,
    alreadyOk: existingOk.size,
    attempted: missing.length,
    uploaded,
    failed,
    failureSamples: failures.slice(0, 50),
  };
  const outPath = path.resolve(process.cwd(), 'backend/public/images/item/db_sync_summary.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log('Sync summary:', summary);
  console.log('Report:', outPath);
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});

