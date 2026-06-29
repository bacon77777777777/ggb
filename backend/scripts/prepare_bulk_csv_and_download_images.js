'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEMPLATE_HEADERS = [
  '商品名稱',
  '商品圖片',
  '價格',
  '商品類型',
  '預購商品',
  '預計出貨時間',
  '顯示菜單',
  '狀態',
  '開賣時間',
  '稀有度',
  '上市時間',
  '代理商',
  '熱賣',
  '獎項1名稱', '獎項1等級', '獎項1數量', '獎項1圖片名稱',
  '獎項2名稱', '獎項2等級', '獎項2數量', '獎項2圖片名稱',
  '獎項3名稱', '獎項3等級', '獎項3數量', '獎項3圖片名稱',
  '獎項4名稱', '獎項4等級', '獎項4數量', '獎項4圖片名稱',
  '獎項5名稱', '獎項5等級', '獎項5數量', '獎項5圖片名稱',
  '獎項6名稱', '獎項6等級', '獎項6數量', '獎項6圖片名稱',
  '獎項7名稱', '獎項7等級', '獎項7數量', '獎項7圖片名稱',
  '獎項8名稱', '獎項8等級', '獎項8數量', '獎項8圖片名稱',
  '獎項9名稱', '獎項9等級', '獎項9數量', '獎項9圖片名稱',
  '獎項10名稱', '獎項10等級', '獎項10數量', '獎項10圖片名稱',
  '獎項11名稱', '獎項11等級', '獎項11數量', '獎項11圖片名稱',
  '獎項12名稱', '獎項12等級', '獎項12數量', '獎項12圖片名稱',
  '獎項13名稱', '獎項13等級', '獎項13數量', '獎項13圖片名稱',
  '獎項14名稱', '獎項14等級', '獎項14數量', '獎項14圖片名稱',
  '獎項15名稱', '獎項15等級', '獎項15數量', '獎項15圖片名稱',
  '獎項16名稱', '獎項16等級', '獎項16數量', '獎項16圖片名稱',
  '獎項17名稱', '獎項17等級', '獎項17數量', '獎項17圖片名稱',
  '獎項18名稱', '獎項18等級', '獎項18數量', '獎項18圖片名稱',
  '獎項19名稱', '獎項19等級', '獎項19數量', '獎項19圖片名稱',
  '獎項20名稱', '獎項20等級', '獎項20數量', '獎項20圖片名稱',
];

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

function csvEscape(value) {
  let s = String(value ?? '');
  if (s.includes('"')) s = s.replace(/"/g, '""');
  if (s.includes(',') || s.includes('\n') || s.includes('\r') || /^\s|\s$/.test(s)) {
    return `"${s}"`;
  }
  return s;
}

function writeCSV(rows) {
  return rows.map(r => r.map(csvEscape).join(',')).join('\n');
}

function normalizeHeader(h) {
  return String(h ?? '').replace(/^\uFEFF+/, '').trim();
}

function sanitizeFileName(name) {
  return String(name || '')
    .trim()
    .replace(/\)+$/, '')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 180);
}

function toDeterministicFilenameFromUrl(urlStr) {
  let base = '';
  try {
    base = path.basename(new URL(urlStr).pathname);
  } catch {
    base = path.basename(String(urlStr));
  }
  base = sanitizeFileName(base);
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  const hash = crypto.createHash('sha1').update(String(urlStr)).digest('hex').slice(0, 6);
  if (!stem) return `${hash}.img`;
  return `${stem}_${hash}${ext || ''}`;
}

function parseUrlOrNull(value) {
  const raw = String(value ?? '').trim().replace(/\)+$/, '');
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return null;
}

async function download(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return res.headers.get('content-type') || '';
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node backend/scripts/prepare_bulk_csv_and_download_images.js <csvPath>');
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const original = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(original);
  if (rows.length < 2) {
    console.error('CSV has no data rows');
    process.exit(1);
  }

  const rawHeaders = rows[0];
  const headers = rawHeaders.map(normalizeHeader);
  const idxByHeader = new Map();
  headers.forEach((h, idx) => {
    if (h && !idxByHeader.has(h)) idxByHeader.set(h, idx);
  });

  const missing = TEMPLATE_HEADERS.filter(h => !idxByHeader.has(h));

  const outRows = [];
  outRows.push(TEMPLATE_HEADERS.slice());

  const downloadDir = path.join(path.dirname(csvPath), `${path.basename(csvPath, path.extname(csvPath))}_images`);
  fs.mkdirSync(downloadDir, { recursive: true });

  const downloadJobs = [];
  const scheduled = new Set();

  const productImgHeader = '商品圖片';
  const prizeImageHeaders = [];
  for (let i = 1; i <= 20; i++) {
    prizeImageHeaders.push(`獎項${i}圖片名稱`);
    prizeImageHeaders.push(`獎項${i}圖片`);
  }

  const getCell = (srcRow, header) => {
    const idx = idxByHeader.get(header);
    if (typeof idx !== 'number') return '';
    return srcRow[idx] ?? '';
  };

  let rewrittenCells = 0;

  for (let r = 1; r < rows.length; r++) {
    const src = rows[r];
    const out = TEMPLATE_HEADERS.map((h) => {
      if (!idxByHeader.has(h)) {
        if (h === '預購商品') return '否';
        return '';
      }
      return getCell(src, h);
    });

    const productIdx = TEMPLATE_HEADERS.indexOf(productImgHeader);
    if (productIdx >= 0) {
      const current = out[productIdx] ?? '';
      const url = parseUrlOrNull(current);
      if (url) {
        const file = toDeterministicFilenameFromUrl(url);
        out[productIdx] = file;
        rewrittenCells += 1;
        const outPath = path.join(downloadDir, file);
        const key = `${url}||${outPath}`;
        if (!scheduled.has(key)) {
          scheduled.add(key);
          downloadJobs.push(async () => {
            if (fs.existsSync(outPath)) return;
            const ct = await download(url, outPath);
            return { url, file, contentType: ct };
          });
        }
      } else if (String(current).trim().startsWith('/')) {
        out[productIdx] = path.basename(String(current).trim());
        rewrittenCells += 1;
      }
    }

    for (let i = 1; i <= 20; i++) {
      const header = `獎項${i}圖片名稱`;
      const idx = TEMPLATE_HEADERS.indexOf(header);
      if (idx < 0) continue;
      const current = out[idx] ?? '';
      const url = parseUrlOrNull(current);
      if (url) {
        const file = toDeterministicFilenameFromUrl(url);
        out[idx] = file;
        rewrittenCells += 1;
        const outPath = path.join(downloadDir, file);
        const key = `${url}||${outPath}`;
        if (!scheduled.has(key)) {
          scheduled.add(key);
          downloadJobs.push(async () => {
            if (fs.existsSync(outPath)) return;
            const ct = await download(url, outPath);
            return { url, file, contentType: ct };
          });
        }
      } else if (String(current).trim().startsWith('/')) {
        out[idx] = path.basename(String(current).trim());
        rewrittenCells += 1;
      }
    }

    outRows.push(out);
  }

  const concurrency = Math.max(1, Math.min(16, Number(process.env.DOWNLOAD_CONCURRENCY || '8')));
  let cursor = 0;
  let completed = 0;
  const downloaded = [];
  const failed = [];

  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= downloadJobs.length) return;
      const job = downloadJobs[idx];
      try {
        const result = await job();
        if (result) downloaded.push(result);
      } catch (e) {
        failed.push({ error: String(e && e.message ? e.message : e) });
      }
      completed += 1;
      if (completed % 50 === 0 || completed === downloadJobs.length) {
        console.log(`Download progress: ${completed}/${downloadJobs.length} (ok=${downloaded.length}, fail=${failed.length})`);
      }
    }
  };

  console.log(`Missing headers added: ${missing.length}`);
  console.log(`Rewritten image cells: ${rewrittenCells}`);
  console.log(`Download jobs: ${downloadJobs.length}`);

  await Promise.all(Array.from({ length: Math.min(concurrency, downloadJobs.length || 1) }, () => worker()));

  const backupPath = `${csvPath}.bak`;
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, original, 'utf8');
  }

  const bom = '\uFEFF';
  fs.writeFileSync(csvPath, bom + writeCSV(outRows), 'utf8');

  const summary = {
    csvPath,
    backupPath,
    downloadDir,
    missingHeaders: missing,
    rewrittenCells,
    downloadJobs: downloadJobs.length,
    downloadedCount: downloaded.length,
    failedCount: failed.length,
    downloaded,
    failed,
  };
  const summaryPath = path.join(downloadDir, 'prepare_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`Done. CSV updated in-place: ${csvPath}`);
  console.log(`Backup: ${backupPath}`);
  console.log(`Images: ${downloadDir}`);
  console.log(`Summary: ${summaryPath}`);
  console.log(`Downloaded: ${downloaded.length}, Failed: ${failed.length}`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

