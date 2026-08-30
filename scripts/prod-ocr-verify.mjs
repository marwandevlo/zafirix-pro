/**
 * Production OCR verification (DB + optional HTTP trigger).
 * Usage: node scripts/prod-ocr-verify.mjs [documentId]
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
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

loadEnvLocal();

const documentId = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const prodBase = process.env.PROD_BASE_URL || 'https://zafirixpro.com';

if (!url || !serviceKey) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const admin = createClient(url, serviceKey);

async function docSnapshot(id) {
  const { data, error } = await admin
    .from('atlas_documents')
    .select('id, user_id, filename, processing_status, mime_type, size_bytes, metadata, extracted_text, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function summarize(data) {
  if (!data) return null;
  const ocr = data.metadata?.ocr ?? {};
  return {
    id: data.id,
    processing_status: data.processing_status,
    page_count: ocr.page_count,
    progress_phase: ocr.progress_phase,
    progress_page: ocr.progress_page,
    started_at: ocr.started_at,
    completed_at: ocr.completed_at,
    error: ocr.error,
    textLen: data.extracted_text?.length ?? 0,
    textPreview: data.extracted_text?.slice(0, 120),
    updated_at: data.updated_at,
  };
}

async function triggerOcrRun(userId, docId) {
  const email = process.env.PROD_TEST_EMAIL?.trim();
  const password = process.env.PROD_TEST_PASSWORD?.trim();
  if (!email || !password || !anonKey) {
    console.log('SKIP HTTP trigger (set PROD_TEST_EMAIL + PROD_TEST_PASSWORD in .env.local)');
    return { skipped: true };
  }

  const auth = createClient(url, anonKey);
  const { error: signErr } = await auth.auth.signInWithPassword({ email, password });
  if (signErr) throw new Error(`signIn: ${signErr.message}`);
  const { data: sess } = await auth.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error('no session token');

  const res = await fetch(`${prodBase}/api/documents/${encodeURIComponent(docId)}/ocr/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function waitForProcessed(id, maxSec = 300) {
  const start = Date.now();
  while (Date.now() - start < maxSec * 1000) {
    const snap = summarize(await docSnapshot(id));
    if (snap?.processing_status === 'processed') return { snap, elapsedSec: ((Date.now() - start) / 1000).toFixed(1) };
    if (snap?.processing_status === 'failed') return { snap, failed: true, elapsedSec: ((Date.now() - start) / 1000).toFixed(1) };
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { snap: summarize(await docSnapshot(id)), timeout: true, elapsedSec: maxSec };
}

async function main() {
  if (!documentId) {
    console.log('Usage: node scripts/prod-ocr-verify.mjs <documentId>');
    process.exit(1);
  }

  const before = summarize(await docSnapshot(documentId));
  console.log('BEFORE', JSON.stringify(before, null, 2));

  const row = await docSnapshot(documentId);
  if (!row) {
    console.error('Document not found');
    process.exit(1);
  }

  const trigger = await triggerOcrRun(row.user_id, documentId);
  console.log('TRIGGER', JSON.stringify(trigger, null, 2));

  const result = await waitForProcessed(documentId);
  console.log('AFTER', JSON.stringify(result, null, 2));

  const pass =
    result.snap?.processing_status === 'processed' &&
    result.snap?.page_count != null &&
    (result.snap?.textLen ?? 0) > 0;

  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
