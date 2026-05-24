import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { watch } from 'fs';
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const INPUTS = {
  nse: resolveInput('nse_equity.csv'),
  bse: resolveInput('bse_equity.csv'),
  etf: resolveInput('ETF_list.csv', 'etf_list.csv'),
};

const OUTPUTS = {
  xlsx: join(ROOT, 'public', 'instruments_data.xlsx'),
  json: join(ROOT, 'public', 'instruments_data.json'),
};

function resolveInput(...filenames) {
  for (const filename of filenames) {
    const filePath = join(ROOT, 'prisma', filename);
    if (existsSync(filePath)) return filePath;
  }

  return join(ROOT, 'prisma', filenames[0]);
}

function readCsv(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing input file: ${filePath}`);
  }

  return parse(readFileText(filePath), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });
}

function readFileText(filePath) {
  return readFileSync(filePath, 'utf8');
}

function cell(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) {
      return String(row[name]).trim();
    }
  }
  return '';
}

function dedupeRows(rows, keyFn) {
  const seen = new Set();
  const result = [];

  for (const row of rows) {
    const key = keyFn(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }

  return result;
}

function normalizeNse(rows) {
  return dedupeRows(rows.map(row => {
    const symbol = cell(row, 'SYMBOL').toUpperCase();
    const name = cell(row, 'NAME OF COMPANY') || symbol;

    return {
      Symbol: symbol,
      'Company Name': name,
      ISIN: cell(row, 'ISIN NUMBER'),
      Exchange: 'NSE',
      AssetType: 'STOCK',
      Sector: '',
      Series: cell(row, ' SERIES', 'SERIES'),
    };
  }).filter(row => row.Symbol), row => `${row.Symbol}:${row.Exchange}`);
}

function normalizeBse(rows) {
  return dedupeRows(rows.map(row => {
    const symbol = cell(row, 'Security Id').toUpperCase();
    const name = cell(row, 'Issuer Name') || cell(row, 'Security Name') || symbol;

    return {
      Symbol: symbol,
      'Company Name': name,
      ISIN: cell(row, 'ISIN No'),
      Exchange: 'BSE',
      AssetType: 'STOCK',
      Sector: '',
      SecurityCode: cell(row, 'Security Code'),
      Group: cell(row, 'Group'),
    };
  }).filter(row => row.Symbol), row => `${row.Symbol}:${row.Exchange}`);
}

function normalizeEtf(rows) {
  return dedupeRows(rows.map(row => {
    const symbol = cell(row, 'Symbol').toUpperCase();
    const name = cell(row, 'SecurityName') || symbol;

    return {
      Symbol: symbol,
      'Company Name': name,
      ISIN: cell(row, 'ISINNumber'),
      Exchange: 'NSE',
      AssetType: 'STOCK',
      Sector: 'Index ETF',
      Underlying: cell(row, 'Underlying'),
    };
  }).filter(row => row.Symbol), row => `${row.Symbol}:${row.Exchange}`);
}

function toJsonRows(...groups) {
  const seen = new Set();
  const result = [];

  for (const rows of groups) {
    for (const row of rows) {
      const key = `${row.Symbol}:${row.Exchange}`;
      if (seen.has(key)) continue;
      seen.add(key);

      result.push({
        s: row.Symbol,
        n: row['Company Name'] || row.Symbol,
        i: row.ISIN || '',
        e: row.Exchange,
        t: row.AssetType || 'STOCK',
        c: row.Sector || '',
      });
    }
  }

  return result;
}

function buildReadmeRows(stats) {
  return [
    ['PortFin - Instrument Master Data'],
    [],
    ['Sheet', 'Description', 'Source', 'Rows'],
    ['NSE_Equity', 'NSE equity instruments', 'prisma/nse_equity.csv', stats.nse],
    ['BSE_Equity', 'BSE equity instruments', 'prisma/bse_equity.csv', stats.bse],
    ['NSE_ETF', 'NSE ETF instruments', 'prisma/ETF_list.csv', stats.etf],
    [],
    ['Generated outputs'],
    ['public/instruments_data.xlsx'],
    ['public/instruments_data.json'],
    [],
    ['JSON keys'],
    ['s', 'Symbol'],
    ['n', 'Company Name'],
    ['i', 'ISIN'],
    ['e', 'Exchange'],
    ['t', 'Asset type'],
    ['c', 'Sector'],
  ];
}

function writeJsonAtomically(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data), 'utf8');
  renameSync(tmpPath, filePath);
}

function writeXlsx(filePath, sheets) {
  const wb = XLSX.utils.book_new();

  for (const [sheetName, rows] of sheets) {
    const ws = Array.isArray(rows[0])
      ? XLSX.utils.aoa_to_sheet(rows)
      : XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  XLSX.writeFile(wb, filePath, { compression: true });
}

export function updateInstrumentsData() {
  const nseRows = normalizeNse(readCsv(INPUTS.nse));
  const bseRows = normalizeBse(readCsv(INPUTS.bse));
  const etfRows = normalizeEtf(readCsv(INPUTS.etf));
  const jsonRows = toJsonRows(nseRows, bseRows, etfRows);
  const stats = {
    nse: nseRows.length,
    bse: bseRows.length,
    etf: etfRows.length,
    json: jsonRows.length,
  };

  writeXlsx(OUTPUTS.xlsx, [
    ['NSE_Equity', nseRows],
    ['BSE_Equity', bseRows],
    ['NSE_ETF', etfRows],
    ['README', buildReadmeRows(stats)],
  ]);
  writeJsonAtomically(OUTPUTS.json, jsonRows);

  console.log(`Updated ${OUTPUTS.xlsx}`);
  console.log(`Updated ${OUTPUTS.json}`);
  console.log(`Rows: NSE ${stats.nse}, BSE ${stats.bse}, ETF ${stats.etf}, JSON ${stats.json}`);

  return stats;
}

function watchInputs() {
  let timer = null;
  const regenerate = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        updateInstrumentsData();
      } catch (err) {
        console.error(err.message);
      }
    }, 250);
  };

  updateInstrumentsData();
  console.log('Watching instrument CSV files for changes. Press Ctrl+C to stop.');

  for (const filePath of Object.values(INPUTS)) {
    watch(filePath, { persistent: true }, regenerate);
  }
}

if (process.argv.includes('--watch')) {
  watchInputs();
} else {
  updateInstrumentsData();
}
