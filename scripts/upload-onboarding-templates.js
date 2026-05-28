#!/usr/bin/env node
/**
 * Provider Solutions CRM — one-time onboarding-template upload.
 *
 * Uploads the four blank fillable PDF templates referenced by the
 * 0010 onboarding catalog seed rows into the existing private
 * `credentials` storage bucket (created in 0004). Run ONCE after
 * 0010 applies and after the source PDFs are placed in the suite
 * `_reference/onboarding-templates/` folder.
 *
 * Run by Jason locally with the Supabase service role key set as an
 * env var. The publishable key won't work — the `credentials` bucket
 * has authenticated-only RLS policies and a server-side script needs
 * service-role to upsert into it. Never run by Claude Code, never
 * run from the deployed CRM, never bundled into the shipping app —
 * this file lives in `scripts/` which Vite does not include in its
 * build graph.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_... \
 *     node scripts/upload-onboarding-templates.js [--dry-run]
 *
 * Behavior:
 *   - Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from env.
 *     SUPABASE_URL defaults to the project URL hardcoded below if
 *     unset, matching the import-from-appsheet.js pattern.
 *   - Reads four PDFs from _reference/onboarding-templates/ at the
 *     suite root (two levels up from this script).
 *   - Uploads each via supabase.storage.from('credentials').upload()
 *     with upsert: true so re-runs lay new bytes over the same path
 *     without erroring. Idempotent.
 *   - --dry-run prints planned uploads without writing.
 *   - Logs each upload with source filename and destination path.
 *   - Exit 0 on success (incl. dry-run); non-zero on hard error
 *     (missing service role key, source PDF missing, upload error).
 *
 * Template paths and versions MUST stay aligned with the 0010
 * catalog seed — that migration is the source of truth for which
 * blank template each catalog row points at.
 */

import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// ─── 1. constants ────────────────────────────────────────────────

// Duplicated from src/api/supabase.js — see import-from-appsheet.js
// for the rationale (browser-only deps in src/api/supabase.js).
const DEFAULT_SUPABASE_URL = 'https://ztbadmaufcpkinnjztxy.supabase.co';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const SUITE_ROOT  = path.resolve(__dirname, '..', '..');
const TEMPLATES   = path.resolve(__dirname, '../../_reference/onboarding-templates');

const BUCKET = 'credentials';

// Source filename → destination storage path. Destination paths
// MUST stay byte-identical to the template_path values seeded by
// migration 0010 — the catalog rows reference these exact strings.
const TEMPLATES_MANIFEST = [
  {
    file: 'physician_services_agreement_v1.0.pdf',
    path: 'templates/physician_services_agreement/v1.0.pdf',
  },
  {
    file: 'physician_attestation_v1.0.pdf',
    path: 'templates/attestation/v1.0.pdf',
  },
  {
    file: 'irs_w9_2024-03.pdf',
    path: 'templates/w9/v2024-03.pdf',
  },
  {
    file: 'direct_deposit_authorization_v1.0.pdf',
    path: 'templates/direct_deposit/v1.0.pdf',
  },
];

// ─── 2. CLI parse ────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// ─── 3. env validation ───────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  console.error(
    'ERROR: SUPABASE_SERVICE_ROLE_KEY is not set in the environment.\n' +
    '\n' +
    'The `credentials` bucket has authenticated-only RLS policies; the\n' +
    'publishable key cannot upsert into it. Service-role is required.\n' +
    '\n' +
    'Set it in your shell session before running, e.g.:\n' +
    '  export SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxxxxxxxxx\n'
  );
  process.exit(1);
}

// ─── 4. main ─────────────────────────────────────────────────────

async function main() {
  console.log(`PS CRM onboarding-template upload — ${new Date().toISOString()}`);
  console.log(`mode:           ${DRY_RUN ? 'dry-run (no uploads)' : 'live'}`);
  console.log(`suite root:     ${SUITE_ROOT}`);
  console.log(`templates dir:  ${TEMPLATES}`);
  console.log(`bucket:         ${BUCKET}`);
  console.log('─'.repeat(60));

  if (!existsSync(TEMPLATES)) {
    console.error(`ERROR: templates directory not found: ${TEMPLATES}`);
    process.exit(1);
  }

  // Verify every source file exists BEFORE making any uploads —
  // fail-fast so a partial run doesn't leave the bucket half-seeded.
  const missing = [];
  for (const entry of TEMPLATES_MANIFEST) {
    const src = path.join(TEMPLATES, entry.file);
    if (!existsSync(src)) missing.push(src);
  }
  if (missing.length > 0) {
    console.error('ERROR: source PDFs missing on disk:');
    for (const m of missing) console.error(`  - ${m}`);
    console.error(
      '\nPlace the missing files in _reference/onboarding-templates/ at the\n' +
      'suite root, then re-run.'
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let uploaded = 0;
  let errored  = 0;

  for (const entry of TEMPLATES_MANIFEST) {
    const src = path.join(TEMPLATES, entry.file);
    const dst = entry.path;

    if (DRY_RUN) {
      console.log(`would upload  ${entry.file}  →  ${BUCKET}/${dst}`);
      uploaded++;
      continue;
    }

    let buffer;
    try {
      buffer = await fs.readFile(src);
    } catch (err) {
      console.error(`ERROR: failed to read ${src}: ${err.message}`);
      errored++;
      continue;
    }

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(dst, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) {
      console.error(`ERROR: upload failed for ${entry.file} → ${BUCKET}/${dst}: ${error.message}`);
      errored++;
      continue;
    }

    console.log(`uploaded      ${entry.file}  →  ${BUCKET}/${dst}`);
    uploaded++;
  }

  console.log('─'.repeat(60));
  console.log(`done. ${uploaded} ${DRY_RUN ? 'planned' : 'uploaded'}, ${errored} errored.`);
  process.exit(errored === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
