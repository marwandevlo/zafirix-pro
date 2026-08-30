/**
 * Trigger production POST /ocr/run via Supabase magic-link session.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}

loadEnvLocal();

const documentId = process.argv[2];
const prodBase = process.env.PROD_BASE_URL || 'https://zafirixpro.com';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!documentId || !url || !serviceKey || !anonKey) {
  console.error('Usage: node scripts/trigger-prod-ocr-http.mjs <documentId>');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const { data: doc } = await admin
  .from('atlas_documents')
  .select('user_id')
  .eq('id', documentId)
  .maybeSingle();

if (!doc?.user_id) {
  console.error('Document not found');
  process.exit(1);
}

const { data: userData, error: userErr } = await admin.auth.admin.getUserById(doc.user_id);
if (userErr || !userData?.user?.email) {
  console.error('User lookup failed', userErr?.message);
  process.exit(1);
}

const email = userData.user.email;
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email,
  options: { redirectTo: `${prodBase}/documents` },
});

if (linkErr || !linkData?.properties?.hashed_token) {
  console.error('generateLink failed', linkErr?.message);
  process.exit(1);
}

const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({
  type: 'magiclink',
  token_hash: linkData.properties.hashed_token,
});

if (otpErr || !otpData.session?.access_token) {
  console.error('verifyOtp failed', otpErr?.message);
  process.exit(1);
}

const token = otpData.session.access_token;
const res = await fetch(`${prodBase}/api/documents/${encodeURIComponent(documentId)}/ocr/run`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
});
const body = await res.json().catch(() => ({}));
console.log(JSON.stringify({ status: res.status, body, email: email.replace(/(.{2}).+(@.*)/, '$1***$2') }, null, 2));
process.exit(res.ok || res.status === 202 ? 0 : 1);
