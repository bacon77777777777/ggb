'use strict';

const fs = require('fs');
const path = require('path');

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
  return String(h ?? '').replace(/^\uFEFF/, '').trim();
}

function toFilenameWebp(val) {
  const raw = String(val ?? '').trim().replace(/\)+$/, '');
  if (!raw) return '';

  let base = '';
  if (raw.startsWith('/')) {
    base = path.basename(raw);
  } else {
    try {
      const u = new URL(raw);
      base = path.basename(u.pathname);
    } catch {
      base = path.basename(raw);
    }
  }

  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  if (!stem) return '';
  return `${stem}.webp`;
}

function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node backend/scripts/normalize_csv_prize_image_filenames_to_webp.js <csvPath>');
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(raw);
  if (rows.length === 0) {
    console.error('CSV is empty');
    process.exit(1);
  }

  const headers = rows[0].map(normalizeHeader);
  const prizeImageIdxs = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (/^獎項\d+圖片名稱$/.test(h) || /^獎項\d+圖片$/.test(h)) {
      prizeImageIdxs.push(i);
    }
  }
  if (prizeImageIdxs.length === 0) {
    console.error('Cannot find any prize image columns (獎項N圖片名稱 / 獎項N圖片).');
    process.exit(1);
  }

  let updated = 0;
  for (let r = 1; r < rows.length; r++) {
    for (const idx of prizeImageIdxs) {
      const before = rows[r][idx] ?? '';
      const after = toFilenameWebp(before);
      if (String(before) !== after) updated += 1;
      rows[r][idx] = after;
    }
  }

  const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : '';
  fs.writeFileSync(csvPath, bom + writeCSV(rows), 'utf8');
  console.log(`Updated ${updated} cells across ${prizeImageIdxs.length} prize image columns. Written in-place: ${csvPath}`);
}

main();

