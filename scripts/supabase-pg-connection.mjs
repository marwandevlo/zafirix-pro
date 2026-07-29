/**
 * Supabase Postgres connection helpers — prefers IPv4-compatible Session Pooler.
 * Direct host db.{ref}.supabase.co often fails with ENOTFOUND on IPv4-only networks.
 */
import pg from 'pg';

export const DEFAULT_POOLER_REGION = 'eu-west-1';

export const POOLER_REGIONS = [
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'us-east-1',
  'us-west-1',
  'ap-southeast-1',
];

/** Session pooler (port 6543) — IPv4 compatible. User: postgres.{projectRef} */
export function buildPoolerUrl(ref, password, region = DEFAULT_POOLER_REGION) {
  const encoded = encodeURIComponent(password);
  return `postgresql://postgres.${ref}:${encoded}@aws-0-${region}.pooler.supabase.com:6543/postgres`;
}

/** Direct host — IPv6-only on many Supabase projects; avoid unless explicitly requested. */
export function buildDirectUrl(ref, password) {
  const encoded = encodeURIComponent(password);
  return `postgresql://postgres:${encoded}@db.${ref}.supabase.co:5432/postgres`;
}

function createPgClient(connectionString, timeoutMs = 8000) {
  const parsed = parsePostgresUrl(connectionString);
  if (parsed) {
    return new pg.Client({
      host: parsed.host,
      port: Number(parsed.port),
      user: parsed.user,
      password: parsed.password,
      database: parsed.database,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: timeoutMs,
    });
  }
  return new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: timeoutMs,
  });
}

function parsePostgresUrl(connectionString) {
  try {
    const u = new URL(connectionString);
    return {
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      host: u.hostname,
      port: u.port || '5432',
      database: u.pathname.replace(/^\//, '') || 'postgres',
    };
  } catch {
    return null;
  }
}

function isDirectSupabaseHost(host, ref) {
  return host === `db.${ref}.supabase.co` || host.endsWith('.supabase.co') && host.startsWith('db.');
}

function isPoolerHost(host) {
  return host.includes('.pooler.supabase.com');
}

/**
 * Rewrite a direct Supabase DATABASE_URL to session pooler format (same password).
 */
export function normalizeToPoolerUrl(connectionString, ref, preferredRegion = DEFAULT_POOLER_REGION) {
  const parsed = parsePostgresUrl(connectionString);
  if (!parsed?.password) return connectionString;

  if (isPoolerHost(parsed.host)) return connectionString;

  if (isDirectSupabaseHost(parsed.host, ref) || parsed.host.includes('supabase.co')) {
    const region =
      preferredRegion ||
      POOLER_REGIONS.find((r) => parsed.host.includes(r)) ||
      DEFAULT_POOLER_REGION;
    return buildPoolerUrl(ref, parsed.password, region);
  }

  return connectionString;
}

export function buildConnectionCandidates(ref, password, { preferredRegion, includeDirect = false } = {}) {
  const regions = preferredRegion
    ? [preferredRegion, ...POOLER_REGIONS.filter((r) => r !== preferredRegion)]
    : POOLER_REGIONS;

  const urls = regions.map((region) => ({
    connectionString: buildPoolerUrl(ref, password, region),
    source: `pooler (${region})`,
  }));

  if (includeDirect) {
    urls.push({ connectionString: buildDirectUrl(ref, password), source: 'direct (db.*.supabase.co)' });
  }

  return urls;
}

export async function testPgConnection(connectionString, timeoutMs = 8000) {
  const client = createPgClient(connectionString, timeoutMs);
  try {
    await client.connect();
    await client.query('select 1');
    return true;
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Resolve a working Postgres connection string for Supabase migrations.
 */
export async function resolveSupabasePgConnection(env, ref) {
  const preferredRegion = env.SUPABASE_POOLER_REGION || DEFAULT_POOLER_REGION;
  const includeDirect = env.SUPABASE_USE_DIRECT === 'true';

  let rawUrl = env.DATABASE_URL ?? env.DIRECT_URL;
  if (rawUrl) {
    const poolerUrl = normalizeToPoolerUrl(rawUrl, ref, preferredRegion);
    if (poolerUrl !== rawUrl) {
      console.log(`  ℹ Rewrote direct DATABASE_URL → session pooler (${preferredRegion})`);
    }
    try {
      await testPgConnection(poolerUrl);
      return { connectionString: poolerUrl, source: 'DATABASE_URL (pooler)' };
    } catch (err) {
      if (!isDirectSupabaseHost(parsePostgresUrl(rawUrl)?.host ?? '', ref)) throw err;
      console.log(`  ⚠ Pooler rewrite failed, trying other regions…`);
    }
  }

  const password = env.SUPABASE_DB_PASSWORD;
  if (!password) return null;

  const candidates = buildConnectionCandidates(ref, password, { preferredRegion, includeDirect });
  const errors = [];

  for (const { connectionString, source } of candidates) {
    try {
      await testPgConnection(connectionString);
      return { connectionString, source: `SUPABASE_DB_PASSWORD → ${source}` };
    } catch (err) {
      errors.push(`${source}: ${err instanceof Error ? err.message : err}`);
    }
  }

  throw new Error(
    `Could not connect via session pooler. Tried: ${candidates.map((c) => c.source).join(', ')}\n` +
      errors.slice(0, 3).join('\n'),
  );
}

export async function queryViaPg(connectionString, sql) {
  const client = createPgClient(connectionString, 20000);
  try {
    await client.connect();
    await client.query(sql);
  } finally {
    await client.end().catch(() => {});
  }
}
