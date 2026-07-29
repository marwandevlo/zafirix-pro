/**
 * Load env vars from project files + process.env (later files do not override existing keys).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const ENV_FILES = ['.env', '.env.production', '.env.vercel', '.env.local'];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function loadProjectEnv() {
  const merged = {};
  for (const file of ENV_FILES) {
    Object.assign(merged, parseEnvFile(path.join(ROOT, file)));
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && value !== '') merged[key] = value;
  }
  return merged;
}

export function projectRefFromSupabaseUrl(supabaseUrl) {
  return supabaseUrl.replace('https://', '').replace('http://', '').split('.')[0];
}

export function appendEnvLocal(pairs) {
  const envPath = path.join(ROOT, '.env.local');
  const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split('\n') : [];
  const existing = new Set(
    lines
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => l.slice(0, l.indexOf('=')).trim()),
  );

  const toAppend = [];
  for (const [key, value] of Object.entries(pairs)) {
    if (!value || existing.has(key)) continue;
    toAppend.push(`${key}=${value}`);
    existing.add(key);
  }

  if (toAppend.length === 0) return false;

  const suffix = lines.length > 0 && lines[lines.length - 1] !== '' ? '\n' : '';
  fs.appendFileSync(envPath, `${suffix}\n# Added by migration runner\n${toAppend.join('\n')}\n`);
  return true;
}
