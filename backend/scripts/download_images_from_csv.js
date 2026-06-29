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
  // push last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function sanitizeName(name) {
  return String(name || '')
    .trim()
    .replace(/\)+$/, '')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 128);
}

function guessExtFromUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const base = path.basename(u.pathname);
    const ext = path.extname(base);
    if (ext) return ext;
    return '.jpg';
  } catch {
    const base = path.basename(urlStr);
    const ext = path.extname(base);
    return ext || '.jpg';
  }
}

async function downloadToFile(urlStr, outPath) {
  const res = await fetch(urlStr);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

async function main() {
  const csvPath = process.argv[2];
  const outDir = process.argv[3] || path.resolve(process.cwd(), 'backend/public/images/item');
  if (!csvPath) {
    console.error('Usage: node backend/scripts/download_images_from_csv.js <csvPath> [outDir]');
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(content).filter(r => r.length > 0);
  if (rows.length === 0) {
    console.error('CSV is empty');
    process.exit(1);
  }
  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);

  // Possible header names for image url
  const imageHeaderCandidates = ['商品圖片', 'image_url', '圖片', '圖片檔名', '商品圖片路徑'];
  let imgIdx = -1;
  for (const cand of imageHeaderCandidates) {
    imgIdx = headers.findIndex(h => h === cand);
    if (imgIdx >= 0) break;
  }
  if (imgIdx < 0) {
    console.error('Cannot find image url column. Headers:', headers);
    process.exit(1);
  }

  // Try to use product code or name for filename prefix
  const codeIdx = headers.findIndex(h => ['編號','product_code','商品編號','code'].includes(h));
  const nameIdx = headers.findIndex(h => ['商品名稱','name','名稱','標題'].includes(h));

  let success = 0;
  let fail = 0;
  const downloaded = [];

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    const rawUrl = (row[imgIdx] || '').trim();
    const url = sanitizeName(rawUrl) ? rawUrl.replace(/\)+$/, '') : '';
    if (!url) continue;
    try {
      let baseName = '';
      if (codeIdx >= 0 && row[codeIdx]) baseName = sanitizeName(row[codeIdx]);
      else if (nameIdx >= 0 && row[nameIdx]) baseName = sanitizeName(row[nameIdx]);

      const ext = guessExtFromUrl(url);
      if (!baseName) {
        // derive from URL
        try {
          const u = new URL(url);
          baseName = sanitizeName(path.basename(u.pathname).replace(ext, ''));
        } catch {
          baseName = sanitizeName(path.basename(url).replace(ext, ''));
        }
      }
      if (!baseName) {
        baseName = crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
      }
      let filename = `${baseName}${ext}`;
      let outPath = path.join(outDir, filename);
      let counter = 1;
      while (fs.existsSync(outPath)) {
        filename = `${baseName}_${counter}${ext}`;
        outPath = path.join(outDir, filename);
        counter += 1;
      }
      await downloadToFile(url, outPath);
      downloaded.push({ row: r + 2, url, file: filename });
      success += 1;
      if (success % 10 === 0) {
        console.log(`Downloaded ${success} files...`);
      }
    } catch (e) {
      fail += 1;
      console.error(`Failed row ${r + 2}: ${url} - ${e.message}`);
    }
  }

  console.log(`Done. Success: ${success}, Fail: ${fail}, OutDir: ${outDir}`);
  const summaryPath = path.join(outDir, 'download_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({ success, fail, outDir, downloaded }, null, 2), 'utf8');
  console.log(`Summary written: ${summaryPath}`);
}

// Node 18+ required for global fetch
if (typeof fetch !== 'function') {
  global.fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
