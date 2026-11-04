/**
 * Local browser-test stack for Business Studio: embedded Postgres (this branch's migrations), PostgREST and the
 * Supabase-shaped gateway on ports 55541-55543, seeded with one fictional user, company, legacy study and a few
 * validated accounting entries. Writes the browser session to <outDir>/session.json and runs until stopped.
 * Usage: node tests/business-studio/e2e/serve-stack.mjs <outDir>
 * Not equivalent to a hosted Supabase project; nothing reads .env files or contacts a hosted service.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createUser, startDatabase, startGateway, startPostgrest, toolsAvailable, userToken } from '../integration/stack.mjs';

const outDir = process.argv[2];
if (!outDir) throw new Error('usage: serve-stack.mjs <outDir>');
if (!toolsAvailable()) throw new Error('local Postgres/PostgREST tools not installed');
mkdirSync(outDir, { recursive: true });

const db = await startDatabase({ port: 55542 });
if (db.failures.length) throw new Error(`migrations failed: ${JSON.stringify(db.failures)}`);
const pgrst = await startPostgrest({ dbPort: 55542, port: 55543 });
const gw = await startGateway({ admin: db.admin, postgrestPort: 55543, port: 55541 });

const user = randomUUID();
const other = randomUUID();
await createUser(db.admin, user, 'studio.e2e@example.test');
await createUser(db.admin, other, 'other.tenant@example.test');
for (const [id, email] of [[user, 'studio.e2e@example.test'], [other, 'other.tenant@example.test']]) {
  await db.admin.query(
    `insert into public.profiles (id, email, full_name, status, onboarding_completed) values ($1, $2, 'Utilisateur Test', 'active', true)
     on conflict (id) do update set status = 'active', onboarding_completed = true, full_name = 'Utilisateur Test'`,
    [id, email],
  );
}
const ws = randomUUID();
const company = randomUUID();
const otherCompany = randomUUID();
await db.admin.query('insert into public.atlas_workspaces (id, owner_user_id, name) values ($1, $2, $3)', [ws, user, 'Espace test']);
await db.admin.query(
  'insert into public.atlas_companies (id, user_id, name, legal_form, ice, rc, if_fiscal, city, company_json, workspace_id, is_active) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)',
  [company, user, 'Café Test SARL', 'SARL', '000000000000001', 'RC-TEST-1', 'IF-TEST-1', 'Rabat', { raisonSociale: 'Café Test SARL', formeJuridique: 'SARL', activite: 'Restauration' }, ws],
);
await db.admin.query('insert into public.atlas_companies (id, user_id, name, company_json, is_active) values ($1, $2, $3, $4, true)', [otherCompany, other, 'Autre locataire', { raisonSociale: 'Autre locataire' }]);

const legacyId = randomUUID();
const legacyMeta = { kind: 'etude_faisabilite', step: 22, etudeReady: true, etudeText: 'Ancienne étude', messages: [], financials: {}, wizardData: { nom_projet: 'Ancienne étude café', secteur: 'Restauration', capital: '100000', ca_prevu: '40000' } };
await db.admin.query('insert into public.atlas_projects (id, user_id, company_id, name, status, metadata) values ($1, $2, $3, $4, $5, $6)', [legacyId, user, company, 'Ancienne étude café', 'completed', legacyMeta]);

const ins = 'insert into public.atlas_accounting_entries (user_id, company_id, entry_json, entry_date, validation_status) values ($1, $2, $3, $4, $5)';
const now = new Date();
const ym = (offset) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 15));
  return d.toISOString().slice(0, 10);
};
for (const [offset, compte, debit, credit] of [[1, '7111', 0, 52000], [1, '6111', 18000, 0], [1, '6131', 9000, 0], [2, '7111', 0, 61000], [2, '6111', 21000, 0]]) {
  await db.admin.query(ins, [user, company, { compte, debit, credit, date: ym(offset) }, ym(offset), 'validated']);
}
await db.admin.query(ins, [other, otherCompany, { compte: '7111', debit: 0, credit: 999999, date: ym(1) }, ym(1), 'validated']);

const accessToken = userToken(user);
const exp = Math.floor(Date.now() / 1000) + 3600;
const session = {
  access_token: accessToken, refresh_token: 'local-refresh-not-used', token_type: 'bearer', expires_in: 3600, expires_at: exp,
  user: { id: user, aud: 'authenticated', role: 'authenticated', email: 'studio.e2e@example.test', app_metadata: {}, user_metadata: {} },
};
writeFileSync(join(outDir, 'session.json'), JSON.stringify({ session, userId: user, companyId: company, legacyId, otherUserToken: userToken(other) }));
console.log(`[stack] ready gateway=${gw.url}`);

const stop = async () => {
  await gw.close();
  pgrst.stop();
  await db.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
