'use strict';

const fs = require('fs');

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

function fixName(name) {
  let s = String(name ?? '');
  if (!s) return s;
  s = s.replace(/潮玩賞\s*/g, '');
  s = s.replace(/賞\s+/g, '賞');
  return s.trim();
}

function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node backend/scripts/fix_csv_chao_wan_shang_to_custom.js <csvPath>');
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
  const nameIdx = headers.findIndex(h => h === '商品名稱');
  const typeIdx = headers.findIndex(h => h === '商品類型' || h === '商品種類' || h === '種類');

  if (nameIdx < 0) {
    console.error('Cannot find 商品名稱 column. Headers:', headers);
    process.exit(1);
  }
  if (typeIdx < 0) {
    console.error('Cannot find 商品類型/商品種類/種類 column. Headers:', headers);
    process.exit(1);
  }

  let matchedRows = 0;
  let renamed = 0;
  let retyped = 0;

  for (let r = 1; r < rows.length; r++) {
    const beforeName = rows[r][nameIdx] ?? '';
    const nameStr = String(beforeName ?? '');
    if (!nameStr.includes('潮玩賞')) continue;
    matchedRows += 1;

    const afterName = fixName(beforeName);
    if (afterName !== String(beforeName)) {
      rows[r][nameIdx] = afterName;
      renamed += 1;
    }

    const beforeType = String(rows[r][typeIdx] ?? '');
    if (beforeType !== '自製賞') {
      rows[r][typeIdx] = '自製賞';
      retyped += 1;
    }
  }

  const backupPath = `${csvPath}.bak`;
  if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, raw, 'utf8');

  const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : '';
  fs.writeFileSync(csvPath, bom + writeCSV(rows), 'utf8');

  console.log(`Matched rows: ${matchedRows}`);
  console.log(`Renamed: ${renamed}`);
  console.log(`Type set to 自製賞: ${retyped}`);
  console.log(`Updated in-place: ${csvPath}`);
  console.log(`Backup: ${backupPath}`);
}

main();

