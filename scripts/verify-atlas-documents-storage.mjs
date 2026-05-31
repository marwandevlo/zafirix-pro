#!/usr/bin/env node
/**
 * Verify Atlas Documents storage config (run against Supabase with service role).
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-atlas-documents-storage.mjs
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const EXPECT_LIMIT = 52_428_800;

async function main() {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) {
    console.error('FAIL listBuckets', error.message);
    process.exit(1);
  }

  const bucket = buckets?.find((b) => b.id === 'atlas-documents');
  if (!bucket) {
    console.error('FAIL bucket atlas-documents missing');
    process.exit(1);
  }

  console.log('PASS bucket exists:', bucket.id);
  console.log('     file_size_limit:', bucket.file_size_limit, bucket.file_size_limit === EXPECT_LIMIT ? 'PASS' : 'FAIL (expected 52428800)');
  console.log('     allowed_mime_types:', bucket.allowed_mime_types?.join(', '));

  const { data: policies, error: polErr } = await admin.rpc('exec_sql', {
    query: `select policyname, cmd, with_check::text from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'atlas_documents_storage%'`,
  }).catch(() => ({ data: null, error: { message: 'rpc not available — check policies in SQL Editor' } }));

  if (polErr || !policies) {
    console.log('WARN policy check skipped (use SQL Editor):', polErr?.message ?? 'no rpc');
  } else {
    console.log('Policies:', policies);
  }
}

main();
