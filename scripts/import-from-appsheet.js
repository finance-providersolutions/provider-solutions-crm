#!/usr/bin/env node
/**
 * Provider Solutions CRM — one-time AppSheet import.
 *
 * Reads `_reference/Snapshot of AppSheet Data - Provider Solutions
 * (2026-05-05).xlsx` and imports providers, organizations
 * (type='hospital' for AppSheet "Locations"), and opportunities
 * into Supabase.
 *
 * Run by Jason locally with the Supabase service role key set as an
 * env var. Never run by Claude Code, never run from the deployed
 * CRM, never bundled into the shipping app — this file lives in
 * `scripts/` which Vite does not include in its build graph.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_... node scripts/import-from-appsheet.js [--dry-run]
 *
 * Behavior summary (full spec: BUILD_PLAN.md §7 deliverable #2):
 *   - Idempotent on appsheet_id. Re-runs upsert by AppSheet ID.
 *   - --dry-run prints planned writes; no DB or storage writes.
 *   - Specialty / position_type / setting normalization per
 *     docs/CRM-appsheet-schema-notes.md §F. Unmapped values are
 *     FLAGGED in the log; rows are not silently coerced.
 *   - Address: full AppSheet string into `address`; city/state
 *     parsed from "City, ST"; zip left null.
 *   - Image migration: uploads from _reference/appsheet-images/
 *     into the two public buckets, idempotent via manifest at
 *     _reference/appsheet-image-import-manifest.json.
 *   - SOURCE_PARTNER_OVERRIDES applied after orgs/opportunities
 *     are imported, looking up partner by name → organizations.id.
 *   - Per-run log at _reference/import-run-YYYY-MM-DD-HHMM.log
 *     (local time; offset printed in the header).
 *   - Exit 0 on success (incl. dry-run); non-zero on hard error
 *     (missing service role key, workbook unreadable, missing
 *     partner-override target).
 */

import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// ─── 1. constants ────────────────────────────────────────────────

// Duplicated from src/api/supabase.js — keep in sync if it ever
// changes. Importing from src/api/supabase.js isn't an option here:
// that file assumes a browser environment and pulls in frontend
// deps. Two lines of duplication is the right trade-off.
const SUPABASE_URL = 'https://ztbadmaufcpkinnjztxy.supabase.co';

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const SUITE_ROOT   = path.resolve(__dirname, '..', '..');
const REFERENCE    = path.join(SUITE_ROOT, '_reference');
const WORKBOOK     = path.join(REFERENCE, 'Snapshot of AppSheet Data - Provider Solutions (2026-05-05).xlsx');
const IMAGE_DIR    = path.join(REFERENCE, 'appsheet-images');
const MANIFEST     = path.join(REFERENCE, 'appsheet-image-import-manifest.json');

const BUCKET_ORG_LOGOS = 'organization-logos';
const BUCKET_PROVIDER_PHOTOS = 'provider-photos';

// Normalization mapping per docs/CRM-appsheet-schema-notes.md §F.
// Update this map AND the doc together — the doc is the source of
// truth and any new value flagged at runtime should be reviewed
// before this map is extended.
const NORMALIZE = {
  // Provider/Opportunity Title → providers.position_type / opportunities.position_type
  position_type: {
    'M.D.':  'MD',
    // Asterisk is a presentational footnote in AppSheet
    // (e.g., honorific / departed); same credential as 'M.D.'
    'M.D.*': 'MD',
  },
  // Provider/Opportunity Specialty → specialty
  specialty: {
    'Gastro.': 'GI',
  },
  // Opportunity Shift Type → setting
  setting: {
    'Inpatient':  'inpatient',
    'Outpatient': 'outpatient',
  },
};

// Source-partner overrides applied after import. Keys are AppSheet
// `Opportunity ID`. Values are the partner organization name —
// resolved at runtime to organizations.id. The named partner MUST
// exist in the database (seeded by 0002_pipelines.sql or created
// via the CRM); otherwise the script logs ERROR and exits non-zero.
//
// Current entries: the two Billings Clinic opportunities are
// sourced from Medicus Healthcare Solutions; Oxford and Birmingham
// are direct (no override needed).
const SOURCE_PARTNER_OVERRIDES = {
  '8b4806ac': 'Medicus Healthcare Solutions',  // Billings Clinic — M.D./Gastro. (Inpatient)
  'af8bac88': 'Medicus Healthcare Solutions',  // Billings Clinic — M.D./Gastro. (Outpatient)
};

// Workbook tabs to import. Anything else (Shifts, Daily Shift Logs,
// Timesheets, Provider Docs, ACH Authorization, Onboarding, etc.)
// is intentionally out of CRM scope per BUILD_PLAN §10.
const SHEETS = {
  locations:     'Locations',
  opportunities: 'Opportunities',
  providers:     'Providers',
};

// ─── 2. CLI parse ────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// ─── 3. env validation ───────────────────────────────────────────

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  console.error(
    'ERROR: SUPABASE_SERVICE_ROLE_KEY is not set in the environment.\n' +
    '\n' +
    'Set it in your shell session before running, e.g.:\n' +
    '  export SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxxxxxxxxx\n' +
    '\n' +
    'The key never goes in the codebase, never gets logged, and is\n' +
    'read only at run time. See BUILD_PLAN.md §7 deliverable #2.\n'
  );
  process.exit(1);
}

// ─── 4. logger ───────────────────────────────────────────────────

function makeLogger() {
  const lines = [];
  const counters = { inserted: 0, updated: 0, skipped: 0, flagged: 0, warned: 0, errored: 0 };

  function record(level, msg) {
    const line = `${level}  ${msg}`;
    lines.push(line);
    if (level === 'WARN')  counters.warned++;
    if (level === 'ERROR') counters.errored++;
    if (level === 'FLAG')  counters.flagged++;
    // Echo to console so the run is observable in real time.
    console.log(line);
  }

  return {
    info:  (m) => record('INFO',  m),
    warn:  (m) => record('WARN',  m),
    error: (m) => record('ERROR', m),
    flag:  (m) => record('FLAG',  m),
    counters,
    lines,
  };
}

function timestampForFile(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-` +
         `${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function timestampForHeader(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())} ${offset}`;
}

async function writeLog(logger) {
  const stamp = timestampForFile();
  const suffix = DRY_RUN ? '-DRYRUN' : '';
  const file = path.join(REFERENCE, `import-run-${stamp}${suffix}.log`);
  const c = logger.counters;
  const header = [
    `PS CRM AppSheet import — ${timestampForHeader()}`,
    `mode: ${DRY_RUN ? 'dry-run' : 'live'}`,
    `counts: ${c.inserted} inserted, ${c.updated} updated, ` +
      `${c.skipped} skipped, ${c.flagged} flagged, ` +
      `${c.warned} warnings, ${c.errored} errors`,
    '─'.repeat(60),
    '',
  ].join('\n');
  await fs.writeFile(file, header + logger.lines.join('\n') + '\n', 'utf8');
  return file;
}

// ─── 5. helpers ──────────────────────────────────────────────────

function trimOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function parseCityState(value) {
  // Strips a trailing ", USA" suffix (case-insensitive), then splits
  // on the first comma. Returns { city, state } or { city: null,
  // state: null } when input is empty / unparseable.
  const s = trimOrNull(value);
  if (!s) return { city: null, state: null };
  const stripped = s.replace(/,\s*USA\.?$/i, '').trim();
  const idx = stripped.indexOf(',');
  if (idx < 0) return { city: stripped || null, state: null };
  const city  = stripped.slice(0, idx).trim() || null;
  const state = stripped.slice(idx + 1).trim() || null;
  return { city, state };
}

function excelTimeToString(frac) {
  // AppSheet exports times as fractions of a day (Excel format).
  // 0.2916666... → 07:00:00; 0.7083333... → 17:00:00; 0.3125 →
  // 07:30:00. Returns "HH:MM:SS" string or null.
  if (frac === null || frac === undefined || frac === '') return null;
  const n = Number(frac);
  if (!Number.isFinite(n)) return null;
  // Round to nearest second to absorb floating-point noise.
  const totalSeconds = Math.round(n * 24 * 60 * 60);
  const h = Math.floor(totalSeconds / 3600) % 24;
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function numericOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number')  return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (s === 'true'  || s === 'yes' || s === 'y' || s === '1') return true;
  if (s === 'false' || s === 'no'  || s === 'n' || s === '0') return false;
  return null;
}

function normalize(field, raw, log, rowIdent) {
  // Returns the canonical CRM value or null. Logs INFO on first hit
  // is not done here (we'd need a counter); we just FLAG misses.
  if (raw === null || raw === undefined || raw === '') return null;
  const map = NORMALIZE[field];
  if (!map) return raw; // unknown field: pass through
  const value = String(raw).trim();
  if (Object.prototype.hasOwnProperty.call(map, value)) {
    return map[value];
  }
  log.flag(
    `${rowIdent}: ${field} value '${value}' has no normalization mapping — ` +
    `field left null. Add to docs/CRM-appsheet-schema-notes.md §F if it should be mapped.`
  );
  return null;
}

function extOf(p) {
  // Returns the lowercase extension including the dot, or empty.
  const m = String(p).match(/\.([a-zA-Z0-9]+)$/);
  return m ? '.' + m[1].toLowerCase() : '';
}

function contentTypeFor(ext) {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png':  return 'image/png';
    case '.gif':  return 'image/gif';
    case '.webp': return 'image/webp';
    default:      return 'application/octet-stream';
  }
}

// ─── 6. main ─────────────────────────────────────────────────────

async function main() {
  const log = makeLogger();
  log.info(`mode: ${DRY_RUN ? 'dry-run (no DB / storage writes)' : 'live'}`);
  log.info(`workbook: ${WORKBOOK}`);

  // Workbook load.
  if (!existsSync(WORKBOOK)) {
    log.error(`workbook not found at ${WORKBOOK}`);
    await writeLog(log);
    process.exit(1);
  }
  let wb;
  try {
    wb = xlsx.readFile(WORKBOOK);
  } catch (err) {
    log.error(`workbook unreadable: ${err.message}`);
    await writeLog(log);
    process.exit(1);
  }

  const locationsRows     = sheetRows(wb, SHEETS.locations,     log);
  const opportunitiesRows = sheetRows(wb, SHEETS.opportunities, log);
  const providersRows     = sheetRows(wb, SHEETS.providers,     log);
  log.info(`Locations:     ${locationsRows.length} rows`);
  log.info(`Opportunities: ${opportunitiesRows.length} rows`);
  log.info(`Providers:     ${providersRows.length} rows`);

  // Manifest load (best-effort).
  const manifest = await loadManifest(log);

  // Image-dir presence.
  const imageDirExists = existsSync(IMAGE_DIR);
  if (!imageDirExists) {
    log.warn(
      `image directory ${IMAGE_DIR} not found — image fields will be ` +
      `left null. Re-run after exporting AppSheet images to refill.`
    );
  }

  // Supabase client (service role).
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ctx = { supabase, log, manifest, imageDirExists };

  // Imports.
  const orgIdsByAppsheetId = await importOrganizations(locationsRows, ctx);
  await importProviders(providersRows, ctx);
  await importOpportunities(opportunitiesRows, orgIdsByAppsheetId, ctx);

  // Source-partner overrides (after orgs + opportunities exist).
  await applySourcePartnerOverrides(ctx);

  // Manifest write (live runs only).
  if (!DRY_RUN) {
    await saveManifest(manifest, log);
  } else {
    log.info('manifest write skipped (dry-run)');
  }

  // Final log file.
  const file = await writeLog(log);
  console.log(`\nlog: ${file}`);
  process.exit(0);
}

// ─── 7. workbook helper ──────────────────────────────────────────

function sheetRows(wb, name, log) {
  const sheet = wb.Sheets[name];
  if (!sheet) {
    log.warn(`sheet '${name}' not found in workbook — skipping`);
    return [];
  }
  return xlsx.utils.sheet_to_json(sheet, { defval: null });
}

// ─── 8. manifest ─────────────────────────────────────────────────

async function loadManifest(log) {
  // Mapping: { "<appsheet_path>": "<supabase_storage_path>" }.
  // Used to skip already-uploaded images on subsequent runs.
  if (!existsSync(MANIFEST)) {
    log.info('manifest: not found — starting fresh');
    return {};
  }
  try {
    const text = await fs.readFile(MANIFEST, 'utf8');
    const obj = JSON.parse(text);
    log.info(`manifest: loaded ${Object.keys(obj).length} entries from ${MANIFEST}`);
    return obj;
  } catch (err) {
    log.warn(`manifest: ${MANIFEST} unreadable (${err.message}) — starting fresh`);
    return {};
  }
}

async function saveManifest(manifest, log) {
  // Atomic-ish write: write to .tmp then rename.
  const tmp = MANIFEST + '.tmp';
  try {
    await fs.writeFile(tmp, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, MANIFEST);
    log.info(`manifest: wrote ${Object.keys(manifest).length} entries to ${MANIFEST}`);
  } catch (err) {
    log.error(`manifest write failed: ${err.message}`);
  }
}

// ─── 9. image upload (idempotent) ────────────────────────────────

async function maybeUploadImage(bucket, parentId, kind, appsheetPath, ctx) {
  // Returns the Supabase Storage path, or null if no upload happened.
  // - parentId: the organization or provider UUID (forms the path prefix)
  // - kind:     'logo' | 'image' | 'photo' (a path segment for orgs)
  // - appsheetPath: e.g., 'Locations_Images/76589f37.Logo.195617.jpg'

  const { manifest, imageDirExists, log, supabase } = ctx;

  if (!appsheetPath) return null;

  // Manifest hit → already done. Return the previously-stored path
  // so the row's logo_path / image_path / photo_path stays correct.
  if (manifest[appsheetPath]) {
    log.info(`image: manifest hit for ${appsheetPath} → ${manifest[appsheetPath]}`);
    return manifest[appsheetPath];
  }

  if (!imageDirExists) {
    return null;  // already warned at startup
  }

  const localPath = path.join(IMAGE_DIR, appsheetPath);
  if (!existsSync(localPath)) {
    log.warn(`image: binary missing on disk for ${appsheetPath} — leaving field null`);
    return null;
  }

  const ext = extOf(appsheetPath) || '.bin';
  const supaPath = bucket === BUCKET_ORG_LOGOS
    ? `${parentId}/${kind}/${crypto.randomUUID()}${ext}`
    : `${parentId}/${crypto.randomUUID()}${ext}`;

  if (DRY_RUN) {
    // Manifest is not touched in dry-run — caller still gets the
    // synthesized supaPath for log output and for downstream patch
    // calls (which are themselves no-ops in dry-run).
    log.info(`would upload ${appsheetPath} → ${bucket}/${supaPath}`);
    return supaPath;
  }

  let buffer;
  try {
    buffer = await fs.readFile(localPath);
  } catch (err) {
    log.warn(`image: failed to read ${localPath}: ${err.message} — leaving field null`);
    return null;
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(supaPath, buffer, {
      contentType: contentTypeFor(ext),
      upsert: false,
    });
  if (error) {
    log.error(`image: upload failed for ${appsheetPath} → ${bucket}/${supaPath}: ${error.message}`);
    return null;
  }

  manifest[appsheetPath] = supaPath;
  log.info(`image: uploaded ${appsheetPath} → ${bucket}/${supaPath}`);
  return supaPath;
}

// ─── 10. import: organizations ───────────────────────────────────

async function importOrganizations(rows, ctx) {
  const { supabase, log } = ctx;
  log.info(`begin: organizations (${rows.length})`);

  // Pre-fetch existing rows by appsheet_id.
  const existing = await fetchExistingByAppsheetId(supabase, 'organizations', log);

  // appsheet_id → organizations.id, returned for use during
  // opportunity import.
  const idMap = new Map();

  for (const row of rows) {
    const appsheetId = trimOrNull(row['Location ID']);
    const name       = trimOrNull(row['Location Name']);
    if (!appsheetId || !name) {
      log.warn(`Locations row missing Location ID or Name — skipping: ${JSON.stringify(row)}`);
      ctx.log.counters.skipped++;
      continue;
    }
    const ident = `Location ${appsheetId}`;

    const cs = parseCityState(row['City, ST']);
    const payload = {
      name,
      type: 'hospital',
      website:           trimOrNull(row['Website']),
      address:           trimOrNull(row['Address']),
      city:              cs.city,
      state:             cs.state,
      zip:               null,
      tourist_site_url:  trimOrNull(row['Location Tourist Site']),
      long_description:  trimOrNull(row['Location Long Description']),
      appsheet_id:       appsheetId,
    };

    let saved;
    try {
      saved = await upsertByAppsheetId(supabase, 'organizations', existing, appsheetId, payload, ctx, ident);
    } catch (err) {
      log.error(`${ident}: write failed: ${err.message}`);
      continue;
    }
    if (!saved) continue;

    idMap.set(appsheetId, saved.id);

    // Image uploads (logo + image, both into organization-logos).
    const logoPath  = await maybeUploadImage(BUCKET_ORG_LOGOS, saved.id, 'logo',  trimOrNull(row['Logo']),  ctx);
    const imagePath = await maybeUploadImage(BUCKET_ORG_LOGOS, saved.id, 'image', trimOrNull(row['Image']), ctx);

    const imgPatch = {};
    if (logoPath  !== null) imgPatch.logo_path  = logoPath;
    if (imagePath !== null) imgPatch.image_path = imagePath;
    if (Object.keys(imgPatch).length > 0) {
      if (DRY_RUN) {
        log.info(`${ident}: would patch ${JSON.stringify(imgPatch)}`);
      } else {
        const { error } = await supabase.from('organizations').update(imgPatch).eq('id', saved.id);
        if (error) log.error(`${ident}: image-path patch failed: ${error.message}`);
      }
    }
  }

  log.info(`end: organizations`);
  return idMap;
}

// ─── 11. import: providers ───────────────────────────────────────

async function importProviders(rows, ctx) {
  const { supabase, log } = ctx;
  log.info(`begin: providers (${rows.length})`);

  const existing = await fetchExistingByAppsheetId(supabase, 'providers', log);

  for (const row of rows) {
    const appsheetId = trimOrNull(row['Provider ID']);
    if (!appsheetId) {
      log.warn(`Providers row missing Provider ID — skipping`);
      log.counters.skipped++;
      continue;
    }
    const ident = `Provider ${appsheetId}`;

    let firstName = trimOrNull(row['First Name']);
    let lastName  = trimOrNull(row['Last Name']);
    if (!firstName || !lastName) {
      log.flag(
        `${ident}: missing First Name or Last Name — using 'Unknown' placeholder. ` +
        `Provider Name='${row['Provider Name'] ?? ''}'`
      );
      firstName = firstName || 'Unknown';
      lastName  = lastName  || 'Unknown';
    }

    const home = parseCityState(row['Resident City/State']);

    const payload = {
      first_name:        firstName,
      last_name:         lastName,
      middle_name:       trimOrNull(row['Middle Name']),
      suffix:            trimOrNull(row['Suffix']),
      email:             trimOrNull(row['Email Address']),
      phone:             trimOrNull(row['Phone Number']),
      npi:               trimOrNull(row['NPI']),
      specialty:         normalize('specialty', row['Specialty'], log, ident),
      position_type:     normalize('position_type', row['Title'], log, ident),
      home_city:         home.city,
      home_state:        home.state,
      aadvantage_number: trimOrNull(row['AAdvantage #']),
      flight_preference: trimOrNull(row['Flight Preference']),
      shirt_size:        trimOrNull(row['Shirt Size']),
      archived:          boolOrNull(row['Hide']) === true,
      // status: not present in AppSheet; left null. The CRM team
      // backfills via the UI as part of normal pipeline work.
      status:            null,
      // source: AppSheet has no equivalent; left null.
      source:            null,
      appsheet_id:       appsheetId,
      notes:             null,
    };

    let saved;
    try {
      saved = await upsertByAppsheetId(supabase, 'providers', existing, appsheetId, payload, ctx, ident);
    } catch (err) {
      log.error(`${ident}: write failed: ${err.message}`);
      continue;
    }
    if (!saved) continue;

    const photoPath = await maybeUploadImage(
      BUCKET_PROVIDER_PHOTOS, saved.id, 'photo', trimOrNull(row['Photo']), ctx
    );
    if (photoPath !== null) {
      if (DRY_RUN) {
        log.info(`${ident}: would patch photo_path=${photoPath}`);
      } else {
        const { error } = await supabase.from('providers').update({ photo_path: photoPath }).eq('id', saved.id);
        if (error) log.error(`${ident}: photo_path patch failed: ${error.message}`);
      }
    }
  }

  log.info(`end: providers`);
}

// ─── 12. import: opportunities ───────────────────────────────────

async function importOpportunities(rows, orgIdsByAppsheetId, ctx) {
  const { supabase, log } = ctx;
  log.info(`begin: opportunities (${rows.length})`);

  const existing = await fetchExistingByAppsheetId(supabase, 'opportunities', log);

  for (const row of rows) {
    const appsheetId = trimOrNull(row['Opportunity ID']);
    const locId      = trimOrNull(row['Location ID']);
    if (!appsheetId || !locId) {
      log.warn(`Opportunities row missing Opportunity ID or Location ID — skipping: ${appsheetId ?? '?'}`);
      log.counters.skipped++;
      continue;
    }
    const ident = `Opportunity ${appsheetId}`;

    const orgId = orgIdsByAppsheetId.get(locId);
    if (!orgId) {
      log.error(`${ident}: parent organization '${locId}' was not imported — skipping row`);
      log.counters.skipped++;
      continue;
    }

    const onCallEnabled = boolOrNull(row['On Call']) === true;
    const billOnCall    = numericOrNull(row['On Call Daily Rate']);
    const payOnCall     = numericOrNull(row['Provider On-Call Pay']);

    if (onCallEnabled && (billOnCall === null || payOnCall === null)) {
      // CHECK constraint on the table would reject this. Flag and
      // disable on-call for this row so the import can proceed; the
      // CRM team can revisit in the UI.
      log.flag(
        `${ident}: On Call=true but bill_on_call_nightly or pay_on_call_nightly missing — ` +
        `forcing on_call_enabled=false to satisfy CHECK constraint. Review and fix in CRM.`
      );
    }
    const safeOnCall = onCallEnabled && billOnCall !== null && payOnCall !== null;

    const payload = {
      organization_id:                   orgId,
      source_partner_id:                 null, // applied later by SOURCE_PARTNER_OVERRIDES
      appsheet_id:                       appsheetId,
      title:                             trimOrNull(row['Title']),
      name:                              trimOrNull(row['Opportunity Name']),
      position_type:                     normalize('position_type', row['Title'],     log, ident),
      specialty:                         normalize('specialty',     row['Specialty'], log, ident),
      setting:                           normalize('setting',       row['Shift Type'], log, ident),
      // location_city / location_state aren't populated from AppSheet —
      // the parent org carries them. CRM users can override per-row
      // via the opportunity form when an opportunity is at a satellite.
      location_city:                     null,
      location_state:                    null,
      start_date:                        null,
      end_date:                          null,

      shift_time_in:                     excelTimeToString(row['Time In']),
      shift_time_out:                    excelTimeToString(row['Time Out']),
      regular_hours_per_day:             numericOrNull(row['Regular Hours']),
      hours_guaranteed:                  boolOrNull(row['Hours Guaranteed?']) ?? true,
      ot_threshold_hours:                numericOrNull(row['Overtime Hours']) ?? 0,

      // Bill side (6 dimensions). AppSheet doesn't have an
      // orientation hourly bill rate or an advanced-shift bonus
      // bill; default 0 per the table column defaults.
      bill_orientation_hourly:           0,
      bill_regular_hourly:               numericOrNull(row['Reg. Hourly Rate']),
      bill_ot_hourly:                    numericOrNull(row['OT Hourly Rate']),
      bill_advanced_shift_bonus_daily:   0,
      on_call_enabled:                   safeOnCall,
      bill_on_call_nightly:              safeOnCall ? billOnCall : null,
      bill_call_back_hourly:             safeOnCall ? numericOrNull(row['Call Back Hourly Rate']) : null,
      call_start_time:                   safeOnCall ? excelTimeToString(row['Call Start Time']) : null,
      call_end_time:                     safeOnCall ? excelTimeToString(row['Call End Time'])   : null,

      // Pay side (5 dimensions).
      pay_orientation_daily:             numericOrNull(row['Provider Orientation Pay']) ?? 0,
      pay_regular_daily:                 numericOrNull(row['Provider Regular Shift Pay']),
      pay_advanced_shift_bonus_daily:    numericOrNull(row['Provider Adv. Shift Bonus']) ?? 0,
      pay_on_call_nightly:               safeOnCall ? payOnCall : null,
      pay_other_bonus_daily:             numericOrNull(row['Provider Other Bonus Pay']) ?? 0,

      modeling_assumptions:              null,
      stage:                              null,
      probability:                        null,
      next_action_date:                   null,
      notes:                              null,
    };

    try {
      await upsertByAppsheetId(supabase, 'opportunities', existing, appsheetId, payload, ctx, ident);
    } catch (err) {
      log.error(`${ident}: write failed: ${err.message}`);
    }
  }

  log.info(`end: opportunities`);
}

// ─── 13. SOURCE_PARTNER_OVERRIDES ────────────────────────────────

async function applySourcePartnerOverrides(ctx) {
  const { supabase, log } = ctx;
  const entries = Object.entries(SOURCE_PARTNER_OVERRIDES);
  if (entries.length === 0) {
    log.info('source-partner overrides: none configured');
    return;
  }
  log.info(`begin: source-partner overrides (${entries.length})`);

  // Resolve each unique partner name once.
  const uniqueNames = [...new Set(entries.map(([, name]) => name))];
  const nameToId = new Map();
  for (const name of uniqueNames) {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, type')
      .eq('name', name)
      .limit(2);
    if (error) {
      log.error(`source-partner: lookup failed for '${name}': ${error.message}`);
      await writeLog(log);
      process.exit(1);
    }
    if (!data || data.length === 0) {
      log.error(
        `source-partner: target organization '${name}' does not exist. ` +
        `The 0002_pipelines.sql seed insert may not have run, or the ` +
        `partner was deleted. Create it manually (type='locums_partner') ` +
        `and re-run.`
      );
      await writeLog(log);
      process.exit(1);
    }
    if (data.length > 1) {
      log.warn(
        `source-partner: multiple organizations named '${name}' exist — ` +
        `using the first (id=${data[0].id}). Consider deduplicating.`
      );
    }
    nameToId.set(name, data[0].id);
  }

  for (const [appsheetOpportunityId, partnerName] of entries) {
    const partnerId = nameToId.get(partnerName);
    const ident = `Opportunity ${appsheetOpportunityId} (override → ${partnerName})`;
    if (DRY_RUN) {
      log.info(`${ident}: would set source_partner_id=${partnerId}`);
      continue;
    }
    const { data, error } = await supabase
      .from('opportunities')
      .update({ source_partner_id: partnerId })
      .eq('appsheet_id', appsheetOpportunityId)
      .select('id');
    if (error) {
      log.error(`${ident}: update failed: ${error.message}`);
      continue;
    }
    if (!data || data.length === 0) {
      log.warn(`${ident}: no matching opportunity row (appsheet_id not found)`);
      continue;
    }
    log.info(`${ident}: set source_partner_id=${partnerId} (${data.length} row)`);
  }

  log.info('end: source-partner overrides');
}

// ─── 14. table-level helpers ─────────────────────────────────────

async function fetchExistingByAppsheetId(supabase, table, log) {
  // Returns Map<appsheet_id, { id, ... }> for rows where
  // appsheet_id is non-null. Used to decide insert vs update.
  const { data, error } = await supabase
    .from(table)
    .select('id, appsheet_id')
    .not('appsheet_id', 'is', null);
  if (error) {
    log.error(`fetchExistingByAppsheetId(${table}): ${error.message}`);
    return new Map();
  }
  const m = new Map();
  for (const r of data ?? []) {
    m.set(r.appsheet_id, r);
  }
  log.info(`pre-fetch ${table}: ${m.size} existing rows by appsheet_id`);
  return m;
}

async function upsertByAppsheetId(supabase, table, existing, appsheetId, payload, ctx, ident) {
  // Insert or update a row keyed on appsheet_id. Returns the
  // saved row (with id), or null on dry-run-with-no-existing-row.
  const { log } = ctx;
  const isUpdate = existing.has(appsheetId);

  if (DRY_RUN) {
    if (isUpdate) {
      log.info(`${ident}: would UPDATE ${table} (appsheet_id=${appsheetId})`);
      ctx.log.counters.updated++;
      return existing.get(appsheetId);
    }
    log.info(`${ident}: would INSERT ${table}`);
    ctx.log.counters.inserted++;
    // Synthesize a placeholder id for downstream calls in this run.
    return { id: `dryrun-${appsheetId}`, ...payload };
  }

  if (isUpdate) {
    const id = existing.get(appsheetId).id;
    const { data, error } = await supabase
      .from(table)
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    ctx.log.counters.updated++;
    log.info(`${ident}: updated ${table} id=${id}`);
    return data;
  }

  const { data, error } = await supabase
    .from(table)
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  // Cache the new row in the existing map so re-references in this
  // run don't create duplicates.
  existing.set(appsheetId, data);
  ctx.log.counters.inserted++;
  log.info(`${ident}: inserted ${table} id=${data.id}`);
  return data;
}

// ─── 15. entrypoint ──────────────────────────────────────────────

main().catch(async (err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
