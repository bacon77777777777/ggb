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

function parseCSV(content) {
  const rows = [];
  let i = 0;
  const n = content.length;
  let field = '';
  let row = [];
  let inQuotes = false;
  while (i < n) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < n && content[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += c;
        i += 1;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
        i += 1;
      } else if (c === ',') {
        row.push(field);
        field = '';
        i += 1;
      } else if (c === '\r') {
        i += 1;
      } else if (c === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i += 1;
      } else {
        field += c;
        i += 1;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(h) {
  return String(h ?? '').replace(/^\uFEFF+/, '').trim();
}

async function main() {
  loadEnv();

  const csvPath = process.argv[2];
  const bucket = process.argv[3] || 'products';
  if (!csvPath) {
    console.error('Usage: node backend/scripts/verify_csv_images_exist_in_storage.js <csvPath> [bucket=products]');
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
    process.exit(1);
  }

  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  if (rows.length < 2) {
    console.error('CSV has no data rows');
    process.exit(1);
  }
  const headers = rows[0].map(normalizeHeader);
  const idxByHeader = new Map();
  headers.forEach((h, i) => { if (h && !idxByHeader.has(h)) idxByHeader.set(h, i); });

  const getIdx = (h) => idxByHeader.has(h) ? idxByHeader.get(h) : -1;
  const productImgIdx = getIdx('商品圖片');
  const prizeImgIdxs = [];
  for (let i = 1; i <= 20; i++) {
    const idx = getIdx(`獎項${i}圖片名稱`);
    if (idx >= 0) prizeImgIdxs.push(idx);
  }

  const filenames = new Set();
  for (let r = 1; r < rows.length; r++) {
    if (productImgIdx >= 0) {
      const v = String(rows[r][productImgIdx] ?? '').trim();
      if (v && !v.startsWith('http') && !v.startsWith('/')) filenames.add(v);
    }
    for (const idx of prizeImgIdxs) {
      const v = String(rows[r][idx] ?? '').trim();
      if (v && !v.startsWith('http') && !v.startsWith('/')) filenames.add(v);
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Collect all object names from bucket root (we upload flat at root)
  const objectNames = new Set();
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list('', { limit, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) {
      console.error('List storage bucket error:', error.message);
      process.exit(1);
    }
    for (const it of (data || [])) {
      if (it.name) objectNames.add(String(it.name));
    }
    if (!data || data.length < limit) break;
    offset += limit;
  }

  let missing = 0;
  const missingSamples = [];
  for (const f of filenames) {
    if (!objectNames.has(f)) {
      missing++;
      if (missingSamples.length < 20) missingSamples.push(f);
    }
  }

  const summary = {
    csvPath,
    bucket,
    totalCsvImages: filenames.size,
    objectsInBucket: objectNames.size,
    missingCount: missing,
    missingSamples,
  };
  const outPath = path.join(path.dirname(csvPath), path.basename(csvPath, path.extname(csvPath)) + '.storage_verify.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  console.log('Report:', outPath);
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
