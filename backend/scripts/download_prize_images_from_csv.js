'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  return String(h ?? '').replace(/^\uFEFF/, '').trim();
}

function sanitizeFileName(name) {
  return String(name || '')
    .trim()
    .replace(/\)+$/, '')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 180);
}

function urlFromValue(value, supabaseUrl) {
  const raw = String(value ?? '').trim().replace(/\)+$/, '');
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('/')) return null;
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/products/${raw}`;
}

async function download(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return { contentType: res.headers.get('content-type') || '' };
}

function readEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) return '';
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    if (k !== key) continue;
    return line.slice(idx + 1).trim();
  }
  return '';
}

async function main() {
  const csvPath = process.argv[2];
  const outDirArg = process.argv[3];
  if (!csvPath) {
    console.error('Usage: node backend/scripts/download_prize_images_from_csv.js <csvPath> [outDir]');
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const baseName = path.basename(csvPath, path.extname(csvPath));
  const outDir = outDirArg || path.resolve(process.cwd(), 'backend/public/images/item', `${baseName}_prize_images`);
  fs.mkdirSync(outDir, { recursive: true });

  const envLocalPath = path.resolve(process.cwd(), 'backend/.env.local');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || readEnvValue(envLocalPath, 'NEXT_PUBLIC_SUPABASE_URL');

  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(content);
  if (rows.length < 2) {
    console.error('CSV has no data rows');
    process.exit(1);
  }

  const headers = rows[0].map(normalizeHeader);
  const prizeImageIdxs = [];
  for (let i = 0; i < headers.length; i++) {
    if (/^獎項\d+圖片名稱$/.test(headers[i]) || /^獎項\d+圖片$/.test(headers[i])) {
      prizeImageIdxs.push(i);
    }
  }
  if (prizeImageIdxs.length === 0) {
    console.error('No prize image columns found.');
    process.exit(1);
  }

  const seen = new Set();
  const downloaded = [];
  const failed = [];

  const tasks = [];

  for (let r = 1; r < rows.length; r++) {
    for (const idx of prizeImageIdxs) {
      const cell = rows[r][idx];
      const url = urlFromValue(cell, supabaseUrl);
      if (!url) continue;
      if (seen.has(url)) continue;
      seen.add(url);

      tasks.push(async () => {
        let filename = '';
        try {
          filename = sanitizeFileName(path.basename(new URL(url).pathname));
        } catch {
          filename = sanitizeFileName(path.basename(String(url)));
        }
        if (!filename) filename = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16) + '.img';

        let outPath = path.join(outDir, filename);
        let counter = 1;
        while (fs.existsSync(outPath)) {
          const ext = path.extname(filename);
          const stem = ext ? filename.slice(0, -ext.length) : filename;
          outPath = path.join(outDir, `${stem}_${counter}${ext || ''}`);
          counter += 1;
        }

        try {
          const meta = await download(url, outPath);
          downloaded.push({ url, file: path.basename(outPath), contentType: meta.contentType });
        } catch (e) {
          failed.push({ url, error: String(e && e.message ? e.message : e) });
        }
      });
    }
  }

  const concurrency = Math.max(1, Math.min(16, Number(process.env.DOWNLOAD_CONCURRENCY || '8')));
  let cursor = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= tasks.length) return;
      await tasks[idx]();
      completed += 1;
      if (completed % 25 === 0 || completed === tasks.length) {
        console.log(`Progress: ${completed}/${tasks.length} (ok=${downloaded.length}, fail=${failed.length})`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));

  const summary = { csvPath, outDir, countUniqueUrls: seen.size, downloadedCount: downloaded.length, failedCount: failed.length, downloaded, failed };
  const summaryPath = path.join(outDir, 'download_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`Done. Downloaded ${downloaded.length}/${seen.size} unique prize images. Failed: ${failed.length}`);
  console.log(`OutDir: ${outDir}`);
  console.log(`Summary: ${summaryPath}`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
