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

function toFilename(val) {
  const raw = String(val ?? '').trim().replace(/\)+$/, '');
  if (!raw) return '';

  if (raw.startsWith('/')) {
    return path.basename(raw);
  }

  try {
    const u = new URL(raw);
    return path.basename(u.pathname);
  } catch {
    return path.basename(raw);
  }
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node backend/scripts/strip_csv_image_filenames.js <csvPath>');
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  if (rows.length === 0) {
    console.error('CSV is empty');
    process.exit(1);
  }

  const headers = rows[0].map(h => String(h || '').replace(/^\uFEFF/, '').trim());
  const imageHeaderCandidates = ['商品圖片', 'image_url', '圖片', '圖片檔名', '商品圖片路徑'];
  let imgIdx = -1;
  for (const cand of imageHeaderCandidates) {
    const idx = headers.findIndex(h => h === cand);
    if (idx >= 0) {
      imgIdx = idx;
      break;
    }
  }
  if (imgIdx < 0) {
    console.error('Cannot find image column. Headers:', headers);
    process.exit(1);
  }

  let updated = 0;
  for (let i = 1; i < rows.length; i++) {
    const before = rows[i][imgIdx];
    const after = toFilename(before);
    if (String(before ?? '') !== after) updated += 1;
    rows[i][imgIdx] = after;
  }

  fs.writeFileSync(csvPath, writeCSV(rows), 'utf8');
  console.log(`Updated ${updated} rows. Written in-place: ${csvPath}`);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

