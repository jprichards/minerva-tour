/**
 * Bulk-update member handicap indexes from commissioner's GHIN export.
 * Source: docs/handicap-dump/03.02.2026_handicaps.xlsx
 *
 * For each golfer in the spreadsheet this script will:
 *   1. Look up the user by email in the `users` table
 *   2. Update `handicap_index` (and `ghin_number` if missing)
 *   3. Insert a row into `handicap_history` with source = 'commissioner_dump'
 *
 * Usage:
 *   node scripts/update-handicaps-2026-03-02.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import XLSX from 'xlsx';

config({ path: '.env.local' });

const DRY_RUN = process.argv.includes('--dry-run');
const EFFECTIVE_DATE = '2026-03-02';
const XLSX_PATH = 'docs/handicap-dump/03.02.2026_handicaps.xlsx';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function parseSpreadsheet() {
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws);

  // Row 0 is a title row, row 1 is the real header (with __EMPTY_N keys).
  // Data rows start at index 2.
  const dataRows = raw.slice(2);

  return dataRows
    .map((r) => {
      const email = (r['2026 Minerva Tour, Version 1, created on 03/02/2026  2:16 PM'] || '').trim().toLowerCase();
      const firstName = (r['__EMPTY_1'] || '').trim();
      const lastName = (r['__EMPTY_2'] || '').trim();
      const indexStr = (r['__EMPTY_4'] || '').toString().trim();
      const ghinId = (r['__EMPTY_5'] || '').toString().trim();

      if (!email || !indexStr) return null;

      return {
        email,
        name: `${firstName} ${lastName}`,
        handicapIndex: parseFloat(indexStr),
        ghinNumber: ghinId || null,
      };
    })
    .filter(Boolean);
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');
  console.log();

  const golfers = parseSpreadsheet();
  console.log(`Parsed ${golfers.length} golfers from spreadsheet\n`);

  // Fetch all users from DB to match by email
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, email, full_name, handicap_index, ghin_number');

  if (usersErr) {
    console.error('Failed to fetch users:', usersErr);
    process.exit(1);
  }

  const usersByEmail = new Map(users.map((u) => [u.email?.toLowerCase(), u]));

  let updated = 0;
  let skipped = 0;
  const notFound = [];

  for (const golfer of golfers) {
    const user = usersByEmail.get(golfer.email);

    if (!user) {
      notFound.push(`${golfer.name} <${golfer.email}>`);
      skipped++;
      continue;
    }

    const handicapChanged = Number(user.handicap_index) !== golfer.handicapIndex;
    const ghinMissing = !user.ghin_number && golfer.ghinNumber;

    const updateFields = { handicap_index: golfer.handicapIndex };
    if (ghinMissing) updateFields.ghin_number = golfer.ghinNumber;

    const oldIndex = user.handicap_index ?? 'N/A';
    if (handicapChanged) {
      console.log(`  ✏️  ${golfer.name}: ${oldIndex} → ${golfer.handicapIndex}${ghinMissing ? ` (+ GHIN ${golfer.ghinNumber})` : ''}`);
    } else {
      console.log(`  ✅ ${golfer.name}: ${golfer.handicapIndex} (unchanged, recording history)`);
    }

    if (!DRY_RUN) {
      const { error: updateErr } = await supabase
        .from('users')
        .update(updateFields)
        .eq('id', user.id);

      if (updateErr) {
        console.error(`    ❌ Failed to update user: ${updateErr.message}`);
        continue;
      }

      const { error: histErr } = await supabase
        .from('handicap_history')
        .insert({
          user_id: user.id,
          handicap_index: golfer.handicapIndex,
          effective_date: EFFECTIVE_DATE,
          source: 'commissioner_dump',
        });

      if (histErr) {
        console.error(`    ❌ Failed to insert handicap history: ${histErr.message}`);
        continue;
      }
    }

    updated++;
  }

  console.log();
  console.log(`Results: ${updated} updated, ${skipped} skipped`);

  if (notFound.length > 0) {
    console.log(`\n⚠️  Not found in DB (${notFound.length}):`);
    notFound.forEach((n) => console.log(`   - ${n}`));
  }

  console.log('\nDone!');
}

main().catch(console.error);
