'use strict';

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envLocal = path.resolve(process.cwd(), 'backend/.env.local');
  if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
  else dotenv.config();
}

function norm(val) {
  const s = String(val ?? '').trim().replace(/\)+$/, '');
  return s;
}

async function head(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  loadEnv();
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
    return `${supabaseUrl}/storage/v1/object/public/products/${v}`;
  };

  const { data: products, error: pErr } = await supabase.from('products').select('id,name,image_url').limit(5000);
  if (pErr) {
    console.error('Query products error:', pErr.message);
    process.exit(1);
  }
  const { data: prizes, error: rErr } = await supabase.from('product_prizes').select('id,product_id,level,name,image_url').limit(50000);
  if (rErr) {
    console.error('Query product_prizes error:', rErr.message);
    process.exit(1);
  }

  const tests = [];
  for (const p of products || []) {
    const url = buildUrl(p.image_url);
    if (url) tests.push({ kind: 'product', id: p.id, name: p.name, url });
  }
  for (const r of prizes || []) {
    const url = buildUrl(r.image_url);
    if (url) tests.push({ kind: 'prize', id: r.id, product_id: r.product_id, name: r.name, level: r.level, url });
  }

  const concurrency = 16;
  let cursor = 0;
  const missing = [];
  const ok = [];
  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= tests.length) return;
      const t = tests[i];
      const good = await head(t.url);
      if (!good) missing.push(t);
      else ok.push(t);
      if ((i + 1) % 200 === 0) {
        console.log(`Checked ${i + 1}/${tests.length} (missing=${missing.length})`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tests.length || 1) }, () => worker()));

  const out = {
    totalUrls: tests.length,
    ok: ok.length,
    missing: missing.length,
    samples: missing.slice(0, 50),
  };
  const outPath = path.resolve(process.cwd(), 'backend/public/images/item/db_images_audit.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('Audit summary:', out);
  console.log('Report:', outPath);
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});

