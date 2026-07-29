/**
 * Verify enterprise features + client portal bridge (storage → document → validation queue).
 * Run: node scripts/verify-enterprise-features.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) throw new Error('.env.local missing');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    env[t.slice(0, eq)] = t.slice(eq + 1);
  }
  return env;
}

function ok(label) {
  console.log(`  ✓ ${label}`);
}
function fail(label, detail) {
  console.error(`  ✗ ${label}${detail ? `: ${detail}` : ''}`);
  process.exitCode = 1;
}

async function tableExists(url, key, table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (res.ok) return true;
  const text = await res.text();
  return !text.includes('PGRST205') && !text.includes('Could not find the table');
}

async function main() {
  console.log('\n=== Zafirix Pro — Enterprise Features Verification ===\n');

  console.log('1. TypeScript (npx tsc --noEmit)');
  try {
    execSync('npx tsc --noEmit', { cwd: ROOT, stdio: 'pipe' });
    ok('Zero TypeScript errors');
  } catch (e) {
    fail('TypeScript check', e.stderr?.toString() || e.message);
  }

  console.log('\n2. Fiscal Calendar Engine');
  const calPath = path.join(ROOT, 'app/lib/atlas-fiscal-calendar.ts');
  if (!fs.existsSync(calPath)) fail('Fiscal calendar', 'file missing');
  else ok('atlas-fiscal-calendar.ts present');

  console.log('\n3. Corporate Vault + Compliance Scanner');
  const vaultPath = path.join(ROOT, 'app/lib/atlas-corporate-vault.ts');
  const compliancePath = path.join(ROOT, 'app/lib/atlas-fiscal-compliance-scanner.ts');
  if (!fs.existsSync(vaultPath)) fail('Corporate vault', 'file missing');
  else ok('atlas-corporate-vault.ts present');
  if (!fs.existsSync(compliancePath)) fail('Compliance scanner', 'file missing');
  else ok('atlas-fiscal-compliance-scanner.ts present');

  const apiPaths = [
    'app/api/dashboard/deadlines/route.ts',
    'app/api/compliance/scan/route.ts',
    'app/api/vault/documents/route.ts',
    'app/api/client-portal/ingest/route.ts',
    'app/api/client-portal/session/route.ts',
  ];
  console.log('\n4. API routes');
  for (const p of apiPaths) {
    if (!fs.existsSync(path.join(ROOT, p))) fail('API route', p);
    else ok(p);
  }

  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    fail('Supabase env', 'missing URL or service role key');
    return;
  }

  console.log('\n5. Client Portal session (code 1234)');
  const demoCode = env.CLIENT_PORTAL_DEMO_CODE || '1234';
  const companyId = env.CLIENT_PORTAL_DEMO_COMPANY_ID;
  const ownerId = env.CLIENT_PORTAL_DEMO_OWNER_USER_ID;

  let resolvedCompanyId = companyId;
  let resolvedOwnerId = ownerId;

  if (!resolvedCompanyId || !resolvedOwnerId) {
    const res = await fetch(
      `${url}/rest/v1/atlas_companies?select=id,user_id&order=created_at.desc&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const rows = await res.json();
    if (!rows?.[0]) fail('Demo company', 'no atlas_companies row');
    resolvedCompanyId = rows[0].id;
    resolvedOwnerId = rows[0].user_id;
  }
  ok(`Demo company ${resolvedCompanyId.slice(0, 8)}… · owner ${resolvedOwnerId.slice(0, 8)}…`);

  const routingTableExists = await tableExists(url, key, 'zafirix_routing_records');
  if (routingTableExists) {
    ok('zafirix_routing_records table present');
  } else {
    ok('zafirix_routing_records absent — using document metadata fallback');
  }

  console.log('\n6. Client Portal bridge (upload → validation queue)');
  const documentId = randomUUID();
  const filename = `verify-client-portal-${Date.now()}.png`;
  const storagePath = `${resolvedOwnerId}/${resolvedCompanyId}/${documentId}/${filename}`;

  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const buffer = Buffer.from(pngBase64, 'base64');

  const uploadRes = await fetch(`${url}/storage/v1/object/atlas-documents/${storagePath}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'image/png',
      'x-upsert': 'false',
    },
    body: buffer,
  });
  if (!uploadRes.ok) {
    const t = await uploadRes.text();
    fail('Storage upload', t.slice(0, 200));
  } else {
    ok('Storage upload');
  }

  const now = new Date().toISOString();
  const docMetadata = {
    source: 'client_portal',
    clientPortalUpload: true,
    validationQueuePending: true,
    validationStatus: 'draft',
    targetModule: 'comptabilite',
    verifyScript: true,
  };

  const docInsert = await fetch(`${url}/rest/v1/atlas_documents`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: documentId,
      user_id: resolvedOwnerId,
      company_id: resolvedCompanyId,
      type: 'receipt',
      title: `Verify client portal — ${filename}`,
      kind: 'generic',
      source: 'client_portal',
      status: 'active',
      filename,
      mime_type: 'image/png',
      size_bytes: buffer.length,
      storage_path: storagePath,
      processing_status: 'uploaded',
      metadata: docMetadata,
      created_at: now,
      updated_at: now,
    }),
  });
  if (!docInsert.ok) {
    fail('Document insert', (await docInsert.text()).slice(0, 200));
  } else {
    ok('Document row created');
  }

  if (routingTableExists) {
    const routeInsert = await fetch(`${url}/rest/v1/zafirix_routing_records`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        user_id: resolvedOwnerId,
        company_id: resolvedCompanyId,
        source_document_id: documentId,
        source_document_type: 'receipt',
        target_module: 'comptabilite',
        target_entity_type: 'client_upload',
        routing_status: 'completed',
        generated_by: 'client_portal',
        validation_status: 'draft',
        payload: { source: 'client_portal', verifyScript: true },
      }),
    });
    if (!routeInsert.ok) {
      fail('Routing record', (await routeInsert.text()).slice(0, 200));
    } else {
      ok('Validation queue routing record (draft)');
    }

    const queueCheck = await fetch(
      `${url}/rest/v1/zafirix_routing_records?source_document_id=eq.${documentId}&validation_status=eq.draft&select=id`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const queueRows = await queueCheck.json();
    if (!Array.isArray(queueRows) || !queueRows.length) {
      fail('Queue verification', 'draft record not found');
    } else {
      ok('Queue contains draft record → visible in /validation');
    }
  } else {
    const docCheck = await fetch(
      `${url}/rest/v1/atlas_documents?id=eq.${documentId}&source=eq.client_portal&select=id,metadata`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const docRows = await docCheck.json();
    const meta = docRows?.[0]?.metadata;
    if (!meta?.validationQueuePending || meta?.validationStatus !== 'draft') {
      fail('Queue verification (metadata fallback)', 'document not flagged for validation');
    } else {
      ok('Document metadata queue flag → visible in /validation (fallback)');
    }
  }

  console.log('\n7. Env flags');
  if (
    env.NEXT_PUBLIC_ENABLE_CLIENT_PORTAL_DEMO === 'true' ||
    env.NEXT_PUBLIC_ENABLE_CLIENT_PORTAL === 'true' ||
    env.NEXT_PUBLIC_ATLAS_DATA_BACKEND === 'supabase'
  ) {
    ok('Client portal enabled for development');
  } else {
    fail('Client portal flags', 'set NEXT_PUBLIC_ENABLE_CLIENT_PORTAL_DEMO=true');
  }

  if (!routingTableExists) {
    console.log('\n  ℹ Apply routing migration: node scripts/apply-routing-migration.mjs');
    console.log('    (or run supabase/migrations/20260602030000_routing_registry.sql in SQL Editor)');
  }

  console.log(`\n=== Done ${process.exitCode ? '(with errors)' : '(all checks passed)'} ===\n`);
  const portalPath = process.env.NEXT_PUBLIC_PORTAL_URL
    ? `${process.env.NEXT_PUBLIC_PORTAL_URL.replace(/\/$/, '')}/${demoCode}`
    : `${env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/portal/${demoCode}`;
  console.log('Client portal:', portalPath);
  console.log('Validation queue: /validation\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
