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

function loadSummary(summaryPath) {
  const json = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  // Map: rowNumber -> filename
  const map = new Map();
  for (const item of json.downloaded || []) {
    // item.row is 2-based row index (including header line)
    map.set(item.row, item.file);
  }
  return map;
}

function sanitizeFilename(name) {
  return String(name || '').trim().replace(/\)+$/, '');
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node backend/scripts/update_csv_image_paths.js <csvPath>');
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }
  const outDir = path.dirname(csvPath);
  const summaryPath = path.join(outDir, 'download_summary.json');
  if (!fs.existsSync(summaryPath)) {
    console.error(`Summary not found: ${summaryPath} (run download_images_from_csv.js first)`);
    process.exit(1);
  }

  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  if (rows.length === 0) {
    console.error('CSV is empty');
    process.exit(1);
  }
  const headers = rows[0];
  const imageHeaderCandidates = ['商品圖片', 'image_url', '圖片', '圖片檔名', '商品圖片路徑'];
  let imgIdx = -1;
  for (const cand of imageHeaderCandidates) {
    const idx = headers.findIndex((h) => h.trim() === cand);
    if (idx >= 0) {
      imgIdx = idx;
      break;
    }
  }
  if (imgIdx < 0) {
    console.error('Cannot find image column. Headers:', headers);
    process.exit(1);
  }

  const map = loadSummary(summaryPath);
  const newRows = rows.slice();
  let updated = 0;
  for (let i = 1; i < newRows.length; i++) {
    const rowNumber = i + 1; // summary uses 1-based lines
    const fileName = map.get(rowNumber);
    if (fileName) {
      const cleaned = sanitizeFilename(fileName);
      newRows[i][imgIdx] = `/images/item/${cleaned}`;
      updated += 1;
    }
  }

  const outPath = path.join(outDir, path.basename(csvPath, '.csv') + '.rewritten.csv');
  fs.writeFileSync(outPath, writeCSV(newRows), 'utf8');
  console.log(`Rewritten CSV: ${outPath} (updated ${updated} rows)`);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

