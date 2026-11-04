/**
 * Local integration stack for Business Studio: embedded Postgres, this branch's migrations, PostgREST and a
 * Supabase-shaped gateway (/rest/v1, /auth/v1/user). Nothing reads .env files or contacts a hosted project.
 * Tools are expected under %TEMP%/zafirix-r3/tools (embedded-postgres, PostgREST); set STUDIO_PG_TOOLS to override.
 * This is not equivalent to a hosted Supabase project.
 */
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const TOOLS = process.env.STUDIO_PG_TOOLS || join(tmpdir(), 'zafirix-r3', 'tools');
const PG_BIN = join(TOOLS, 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin');
const POSTGREST_EXE = join(TOOLS, 'pgrst-v14.18', 'postgrest.exe');
export const JWT_SECRET = 'studio-local-only-jwt-secret-not-used-anywhere-else-01';
const DB_NAME = 'zafirix_studio';

export function toolsAvailable() {
  return existsSync(POSTGREST_EXE) && existsSync(join(TOOLS, 'node_modules', 'embedded-postgres'));
}

const b64url = (input) => Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function signJwt(claims) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ iat: now, exp: now + 3600, aud: 'authenticated', ...claims }));
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token) {
  const [h, b, s] = String(token).split('.');
  if (!h || !b || !s) return null;
  const expected = createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (expected !== s) return null;
  const claims = JSON.parse(Buffer.from(b.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

export const ANON_KEY = signJwt({ role: 'anon', exp: Math.floor(Date.now() / 1000) + 86400 });
export const SERVICE_KEY = signJwt({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 86400 });
export const userToken = (userId) => signJwt({ sub: userId, role: 'authenticated', email: `${userId}@studio.test` });

export async function startDatabase({ port = 55532 } = {}) {
  process.env.PATH = `${PG_BIN};${process.env.PATH}`;
  const { default: EmbeddedPostgres } = await import(pathToFileURL(join(TOOLS, 'node_modules', 'embedded-postgres', 'dist', 'index.js')).href);
  const dataDir = join(tmpdir(), 'zafirix-studio-it', `pgdata-${port}-${Date.now()}`);
  mkdirSync(join(tmpdir(), 'zafirix-studio-it'), { recursive: true });
  const server = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await server.initialise();
  await server.start();
  await server.createDatabase(DB_NAME);
  const connectionString = `postgres://postgres:postgres@127.0.0.1:${port}/${DB_NAME}`;
  const admin = new pg.Client({ connectionString });
  await admin.connect();
  await admin.query(readFileSync(join(import.meta.dirname, 'supabase-base.sql'), 'utf8'));
  const dir = join(ROOT, 'supabase', 'migrations');
  const all = readdirSync(dir).filter((n) => n.endsWith('.sql')).sort();
  const timestamped = all.filter((n) => /^\d{14}_/.test(n));
  const pending = new Set(all.filter((n) => !/^\d{14}_/.test(n)));
  const failures = [];
  for (const file of timestamped) {
    const sql = readFileSync(join(dir, file), 'utf8');
    try {
      await admin.query(sql);
    } catch (first) {
      for (const b of [...pending]) {
        try { await admin.query(readFileSync(join(dir, b), 'utf8')); pending.delete(b); } catch { /* prerequisites missing */ }
      }
      try { await admin.query(sql); } catch (e) { failures.push({ file, message: e.message, first: first.message }); break; }
    }
  }
  async function stop() {
    await admin.end().catch(() => {});
    await server.stop().catch(() => {});
    try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* locked on Windows */ }
  }
  return { admin, connectionString, failures, stop };
}

export async function startPostgrest({ dbPort = 55532, port = 55533 } = {}) {
  const child = spawn(POSTGREST_EXE, [], {
    env: {
      ...process.env, PATH: `${PG_BIN};${process.env.PATH}`,
      PGRST_DB_URI: `postgres://authenticator:authenticator@127.0.0.1:${dbPort}/${DB_NAME}`,
      PGRST_DB_SCHEMAS: 'public', PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: JWT_SECRET,
      PGRST_SERVER_PORT: String(port), PGRST_SERVER_HOST: '127.0.0.1', PGRST_DB_POOL: '10', PGRST_DB_MAX_ROWS: '1000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.status < 500) return { child, stop: () => child.kill() };
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error(`PostgREST did not start:\n${log}`);
}

/** @param {{ admin: import('pg').Client, postgrestPort?: number, port?: number }} options */
export async function startGateway({ admin, postgrestPort = 55533, port = 55521 }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.headers.origin) {
      res.setHeader('access-control-allow-origin', req.headers.origin);
      res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] ?? '*');
      res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
      res.setHeader('access-control-expose-headers', 'content-range,content-profile');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (url.pathname === '/auth/v1/user') {
      const auth = String(req.headers.authorization ?? '');
      const claims = auth.toLowerCase().startsWith('bearer ') ? verifyJwt(auth.slice(7)) : null;
      if (!claims?.sub) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"code":401}'); return; }
      const { rows } = await admin.query('select id, email, created_at from auth.users where id = $1', [claims.sub]);
      if (!rows.length) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"code":404}'); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: rows[0].id, aud: 'authenticated', role: 'authenticated', email: rows[0].email, app_metadata: {}, user_metadata: {}, created_at: rows[0].created_at }));
      return;
    }
    if (url.pathname.startsWith('/rest/v1')) {
      const target = `http://127.0.0.1:${postgrestPort}${url.pathname.slice('/rest/v1'.length) || '/'}${url.search}`;
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = { ...req.headers };
      delete headers.host;
      delete headers['content-length'];
      if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
      const upstream = await fetch(target, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const body = Buffer.from(await upstream.arrayBuffer());
      const out = {};
      upstream.headers.forEach((value, key) => { if (!['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(key)) out[key] = value; });
      res.writeHead(upstream.status, out);
      res.end(body);
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"error":"not_in_gateway"}');
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

export async function createUser(admin, id, email) {
  await admin.query('insert into auth.users (id, email) values ($1, $2)', [id, email ?? `${id}@studio.test`]);
  return id;
}
