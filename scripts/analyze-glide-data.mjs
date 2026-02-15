#!/usr/bin/env node
/**
 * Analyze the Glide app Excel export to understand data structure
 * for migration planning.
 */
import XLSX from 'xlsx';
import { resolve } from 'path';

const filePath = resolve('docs/glide-app/Minerva Tour App.xlsx');
const workbook = XLSX.readFile(filePath);

console.log(`\n=== MINERVA TOUR GLIDE DATA ANALYSIS ===\n`);
console.log(`Total sheets: ${workbook.SheetNames.length}`);
console.log(`Sheet names: ${workbook.SheetNames.join(', ')}\n`);

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const headers = data.length > 0 ? Object.keys(data[0]) : [];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SHEET: "${sheetName}" — ${data.length} rows, ${headers.length} columns`);
  console.log(`${'='.repeat(60)}`);

  if (headers.length > 0) {
    console.log(`Columns: ${headers.join(' | ')}`);
  }

  // Show first 3 rows as samples
  const sampleRows = data.slice(0, 3);
  if (sampleRows.length > 0) {
    console.log(`\nSample data (first ${sampleRows.length} rows):`);
    for (let i = 0; i < sampleRows.length; i++) {
      const row = sampleRows[i];
      const preview = {};
      for (const [key, val] of Object.entries(row)) {
        // Truncate long values
        const strVal = String(val);
        preview[key] = strVal.length > 60 ? strVal.substring(0, 57) + '...' : strVal;
      }
      console.log(`  Row ${i + 1}: ${JSON.stringify(preview)}`);
    }
  }
}

// Special deep-dive on key migration tabs
const keyTabs = ['Members', 'Inactive Members', 'Courses', 'Score Archive', 'Round History',
  'Current Event Scores', 'Event Result History', 'Controls', 'Types', 'Combined Scores',
  'GG Handicap Import', 'Scores + Points', 'Player Stats', 'Season Standings Pivot',
  'Net + Scratch Season Standings', 'Playoff Bracket', 'Head to Head Playoffs'];

console.log(`\n\n${'#'.repeat(60)}`);
console.log(`# MIGRATION-RELEVANT TABS — FULL COLUMN ANALYSIS`);
console.log(`${'#'.repeat(60)}`);

for (const tabName of keyTabs) {
  if (!workbook.SheetNames.includes(tabName)) {
    console.log(`\n[SKIP] "${tabName}" — not found`);
    continue;
  }

  const sheet = workbook.Sheets[tabName];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (data.length === 0) {
    console.log(`\n[SKIP] "${tabName}" — empty`);
    continue;
  }

  const headers = Object.keys(data[0]);
  console.log(`\n--- ${tabName} (${data.length} rows) ---`);

  // For each column, show type and sample values
  for (const col of headers) {
    const values = data.map(r => r[col]).filter(v => v !== '' && v != null);
    const uniqueCount = new Set(values.map(String)).size;
    const sampleVals = values.slice(0, 5).map(v => {
      const s = String(v);
      return s.length > 40 ? s.substring(0, 37) + '...' : s;
    });
    console.log(`  ${col}: ${values.length} non-empty, ${uniqueCount} unique — samples: [${sampleVals.join(', ')}]`);
  }
}
