/**
 * Provider Solutions CRM — Cloudflare Worker entry point.
 *
 * This worker fronts the static SPA built into `dist/` and adds a
 * single dynamic API route. Cloudflare's Workers-with-Static-Assets
 * binding (`env.ASSETS`) handles everything that isn't `/api/*` —
 * including the SPA-fallback behavior previously declared on the
 * assets binding alone. The Worker only runs for paths the assets
 * binding doesn't already serve, so the cost of having a worker
 * script at all is near-zero for normal page loads.
 *
 * Dynamic routes:
 *
 *   GET /api/onboarding-template/:item_key
 *     Looks up the onboarding_item_types row for :item_key and
 *     returns a 302 redirect to a 5-minute Supabase signed URL for
 *     the row's template_path inside the `credentials` bucket.
 *
 *     Why server-side: the previous client-side
 *     createSignedUrl + window.open pattern is blocked by iOS
 *     WebKit (Safari + Chrome on iOS both ride WebKit), which
 *     treats `window.open` invoked AFTER an async fetch as a
 *     programmatic popup and silently refuses it. A same-origin
 *     anchor that 302s to the signed URL is treated as a normal
 *     user-gesture navigation and works on every browser.
 *
 *     The browser never sees the service-role key. The signed URL
 *     is minted server-side, embedded in the Location header, and
 *     the browser follows the redirect to Supabase Storage with
 *     the short-lived signature baked into the query string.
 *
 * Service-role key:
 *   The Supabase service-role key is read from
 *   `env.SUPABASE_SERVICE_ROLE_KEY`, a Cloudflare Workers SECRET
 *   set out-of-band via `wrangler secret put`. It is never
 *   committed and never exposed to the browser. If the secret is
 *   missing the route returns 500 (and logs the cause to
 *   `wrangler tail`) rather than silently falling back to anything
 *   less secure.
 *
 * Static assets pass-through:
 *   Anything that isn't an `/api/*` route is forwarded to
 *   `env.ASSETS.fetch(request)`, which preserves the SPA fallback
 *   (`not_found_handling: "single-page-application"` from
 *   wrangler.jsonc).
 */

import { createClient } from '@supabase/supabase-js';

// Duplicated from src/api/supabase.js. The browser bundle and the
// Worker bundle are separate runtimes; importing from src/ here
// would drag the publishable-key client into the worker and the
// service-role client doesn't share initialization, so two lines
// of duplication is the right trade-off.
const SUPABASE_URL = 'https://ztbadmaufcpkinnjztxy.supabase.co';

// Strict allow-list for the item_key path segment. Matches the
// schema constraint we follow by convention (lower snake_case in
// onboarding_item_types.key). Anything that fails this check 404s
// before any DB or storage call runs — defense against path
// traversal, special characters, or accidental URL noise.
const ITEM_KEY_PATTERN = /^[a-z0-9_]+$/;

const TEMPLATE_BUCKET = 'credentials';
const SIGNED_URL_TTL_SECONDS = 300;

export default {
  /**
   * @param {Request} request
   * @param {{ ASSETS: { fetch: (req: Request) => Promise<Response> }, SUPABASE_SERVICE_ROLE_KEY?: string }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    // /api/onboarding-template/:item_key
    const templateMatch = url.pathname.match(/^\/api\/onboarding-template\/([^/]+)\/?$/);
    if (templateMatch) {
      if (request.method !== 'GET') {
        return jsonError(405, 'method not allowed');
      }
      return handleTemplate(templateMatch[1], env);
    }

    // Any other /api/* path is unknown — return 404 explicitly
    // rather than falling through to the SPA fallback (which would
    // hand back index.html and confuse API callers).
    if (url.pathname.startsWith('/api/')) {
      return jsonError(404, 'not found');
    }

    // Everything else: static assets + SPA fallback.
    return env.ASSETS.fetch(request);
  },
};

async function handleTemplate(rawItemKey, env) {
  if (!ITEM_KEY_PATTERN.test(rawItemKey)) {
    return jsonError(404, 'template not found');
  }

  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Run ' +
      '`wrangler secret put SUPABASE_SERVICE_ROLE_KEY` from ps-app-crm/.'
    );
    return jsonError(500, 'server misconfigured');
  }

  const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error: lookupErr } = await supabase
    .from('onboarding_item_types')
    .select('template_path, version')
    .eq('key', rawItemKey)
    .maybeSingle();

  if (lookupErr) {
    console.error('onboarding_item_types lookup failed', { key: rawItemKey, error: lookupErr });
    return jsonError(500, 'lookup failed');
  }
  if (!row || !row.template_path) {
    return jsonError(404, 'template not found');
  }

  const { data: signed, error: signErr } = await supabase
    .storage
    .from(TEMPLATE_BUCKET)
    .createSignedUrl(row.template_path, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    console.error('createSignedUrl failed', { key: rawItemKey, path: row.template_path, error: signErr });
    return jsonError(500, 'could not sign url');
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: signed.signedUrl,
      // Don't let any intermediary cache the redirect itself; the
      // signed URL inside it is valid for only SIGNED_URL_TTL_SECONDS.
      'Cache-Control': 'no-store',
    },
  });
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
