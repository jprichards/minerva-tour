#!/usr/bin/env node
/**
 * Minerva Tour — Profile Picture Migration
 *
 * Finds users whose profile_picture_url points to an external source
 * (e.g. old Glide/Firebase URLs), downloads each image, uploads it
 * to the Supabase `profile-pictures` storage bucket, and updates
 * the user's profile_picture_url to the new Supabase public URL.
 *
 * Usage:
 *   node scripts/migrate-profile-pictures.mjs [--dry-run]
 *
 * Environment (from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)
 */

import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve('.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE env vars. Check .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SUPABASE_STORAGE_HOST = new URL(supabaseUrl).hostname;

function guessExtension(contentType, url) {
  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/svg+xml': 'svg',
  };
  if (contentType && mimeMap[contentType.split(';')[0].trim()]) {
    return mimeMap[contentType.split(';')[0].trim()];
  }
  const urlExt = url.split('?')[0].split('.').pop()?.toLowerCase();
  if (urlExt && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(urlExt)) {
    return urlExt === 'jpeg' ? 'jpg' : urlExt;
  }
  return 'jpg';
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   PROFILE PICTURE MIGRATION                        ║');
  console.log(`║   Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE — downloading & uploading'}${DRY_RUN ? '  ' : ''}       ║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // Fetch all users with a profile picture URL
  const { data: users, error } = await supabase
    .from('users')
    .select('id, full_name, email, profile_picture_url')
    .not('profile_picture_url', 'is', null);

  if (error) {
    console.error('Failed to fetch users:', error.message);
    process.exit(1);
  }

  // Filter to only external (non-Supabase) URLs
  const external = users.filter(
    (u) => u.profile_picture_url && !u.profile_picture_url.includes(SUPABASE_STORAGE_HOST)
  );

  console.log(`Total users with profile pictures: ${users.length}`);
  console.log(`External (non-Supabase) URLs to migrate: ${external.length}\n`);

  if (external.length === 0) {
    console.log('Nothing to migrate — all profile pictures are already on Supabase.');
    return;
  }

  let migrated = 0;
  let failed = 0;

  for (const user of external) {
    const label = `${user.full_name || user.email} (${user.id})`;
    const oldUrl = user.profile_picture_url;
    console.log(`\n── ${label}`);
    console.log(`   Old URL: ${oldUrl}`);

    if (DRY_RUN) {
      console.log('   [DRY RUN] Would download & re-upload');
      migrated++;
      continue;
    }

    try {
      // Download the image
      const response = await fetch(oldUrl, {
        headers: { 'User-Agent': 'Minervatour-Migration/1.0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.log(`   [SKIP] HTTP ${response.status} — image not accessible`);
        failed++;
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        console.log(`   [SKIP] Not an image (content-type: ${contentType})`);
        failed++;
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = guessExtension(contentType, oldUrl);
      const filePath = `${user.id}/avatar.${ext}`;

      console.log(`   Downloaded: ${(buffer.length / 1024).toFixed(1)} KB (${contentType})`);

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(filePath, buffer, {
          upsert: true,
          contentType: contentType.split(';')[0].trim(),
        });

      if (uploadError) {
        console.log(`   [ERROR] Upload failed: ${uploadError.message}`);
        failed++;
        continue;
      }

      // Get the public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('profile-pictures').getPublicUrl(filePath);

      // Update the user record
      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_picture_url: publicUrl })
        .eq('id', user.id);

      if (updateError) {
        console.log(`   [ERROR] DB update failed: ${updateError.message}`);
        failed++;
        continue;
      }

      console.log(`   ✓ Migrated → ${publicUrl}`);
      migrated++;
    } catch (err) {
      console.log(`   [ERROR] ${err.message}`);
      failed++;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Total:    ${external.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
