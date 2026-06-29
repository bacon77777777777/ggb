'use strict';

const fs = require('fs');
const path = require('path');

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
  return String(h ?? '').replace(/^\uFEFF/, '').trim();
}

function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node backend/scripts/normalize_products_csv_to_template.js <csvPath>');
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

  const oldHeaders = rows[0].map(normalizeHeader);
  const indexByHeader = new Map();
  oldHeaders.forEach((h, idx) => {
    if (!indexByHeader.has(h)) indexByHeader.set(h, idx);
  });

  const missing = TEMPLATE_HEADERS.filter(h => !indexByHeader.has(h));
  const extra = oldHeaders.filter(h => h && !TEMPLATE_HEADERS.includes(h));

  const outRows = [];
  outRows.push(TEMPLATE_HEADERS.slice());

  for (let i = 1; i < rows.length; i++) {
    const src = rows[i];
    const out = TEMPLATE_HEADERS.map((h) => {
      const idx = indexByHeader.get(h);
      if (typeof idx !== 'number') {
        if (h === '預購商品') return '否';
        return '';
      }
      return src[idx] ?? '';
    });
    outRows.push(out);
  }

  const bom = '\uFEFF';
  const content = bom + writeCSV(outRows);
  const backupPath = `${csvPath}.bak`;
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, raw, 'utf8');
  }
  fs.writeFileSync(csvPath, content, 'utf8');

  const meta = {
    csvPath,
    backupPath,
    oldHeaderCount: oldHeaders.length,
    newHeaderCount: TEMPLATE_HEADERS.length,
    missing,
    extra,
  };
  const metaPath = path.join(path.dirname(csvPath), path.basename(csvPath, '.csv') + '.template_check.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  console.log(`Normalized to template in-place: ${csvPath}`);
  console.log(`Backup: ${backupPath}`);
  console.log(`Report: ${metaPath}`);
  console.log(`Missing added: ${missing.join(', ') || '(none)'}`);
  if (extra.length > 0) console.log(`Extra ignored: ${extra.join(', ')}`);
}

main();

