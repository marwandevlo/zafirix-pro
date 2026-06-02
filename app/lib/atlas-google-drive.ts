/**
 * Google Drive integration client.
 * Uses Drive API v3 via native fetch — no googleapis dependency required.
 * Handles: OAuth2 token refresh, folder creation (idempotent), file upload.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI   (e.g. https://yourapp.vercel.app/api/integrations/google-drive/callback)
 */

import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const GDRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
export const GDRIVE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

// ── Config ────────────────────────────────────────────────────────────────────

export function getGoogleClientId(): string {
  return (process.env.GOOGLE_CLIENT_ID ?? '').trim();
}
export function getGoogleClientSecret(): string {
  return (process.env.GOOGLE_CLIENT_SECRET ?? '').trim();
}
export function getGoogleRedirectUri(): string {
  return (process.env.GOOGLE_REDIRECT_URI ?? '').trim();
}
export function isGoogleDriveConfigured(): boolean {
  return !!(getGoogleClientId() && getGoogleClientSecret() && getGoogleRedirectUri());
}

// ── OAuth2 URL ────────────────────────────────────────────────────────────────

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: getGoogleRedirectUri(),
    response_type: 'code',
    scope: GDRIVE_OAUTH_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ── Token exchange + refresh ──────────────────────────────────────────────────

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      redirect_uri: getGoogleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed: ${body}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_at: Date }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${body}`);
  }
  const data = await res.json() as TokenResponse;
  const expires_at = new Date(Date.now() + data.expires_in * 1000);
  return { access_token: data.access_token, expires_at };
}

export async function getGoogleUserEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return '';
  const data = await res.json() as { email?: string };
  return data.email ?? '';
}

// ── Credential management ─────────────────────────────────────────────────────

export type GDriveCredentials = {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  google_email: string | null;
};

/** Get and auto-refresh credentials for a user. Returns null if not connected. */
export async function getValidCredentials(userId: string): Promise<{ accessToken: string; email: string } | null> {
  const admin = getSupabaseServiceRoleClient();

  const { data: creds } = await admin
    .from('zafirix_google_credentials')
    .select('access_token, refresh_token, expires_at, google_email')
    .eq('user_id', userId)
    .maybeSingle();

  if (!creds) return null;

  // Check if token is still valid (with 60s buffer)
  const expiresAt = creds.expires_at ? new Date(String(creds.expires_at)) : null;
  const needsRefresh = !expiresAt || expiresAt.getTime() < Date.now() + 60_000;

  if (!needsRefresh) {
    return { accessToken: String(creds.access_token), email: String(creds.google_email ?? '') };
  }

  // Refresh using refresh token
  if (!creds.refresh_token) return null;

  try {
    const { access_token, expires_at } = await refreshAccessToken(String(creds.refresh_token));
    await admin
      .from('zafirix_google_credentials')
      .update({ access_token, expires_at: expires_at.toISOString(), updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    return { accessToken: access_token, email: String(creds.google_email ?? '') };
  } catch {
    return null;
  }
}

// ── Folder operations ─────────────────────────────────────────────────────────

/** Find a folder by name + parent. Returns its ID, or null if not found. */
async function findFolder(accessToken: string, parentId: string, folderName: string): Promise<string | null> {
  const safe = folderName.replace(/'/g, "\\'");
  const q = `name='${safe}' and mimeType='${GDRIVE_FOLDER_MIME}' and '${parentId}' in parents and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Drive search failed: ${await res.text()}`);
  const data = await res.json() as { files: { id: string }[] };
  return data.files[0]?.id ?? null;
}

/** Find or create a folder. Idempotent. */
export async function findOrCreateFolder(
  accessToken: string,
  parentId: string,
  folderName: string,
): Promise<string> {
  const existing = await findFolder(accessToken, parentId, folderName);
  if (existing) return existing;

  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: GDRIVE_FOLDER_MIME,
      parents: [parentId],
    }),
  });
  if (!res.ok) throw new Error(`Drive folder creation failed: ${await res.text()}`);
  const data = await res.json() as { id: string };
  return data.id;
}

export type ZafirixFolderIds = {
  root: string;
  company: string;
  documentsIa: string;
  factures: string;
  comptabilite: string;
  rapports: string;
  juridique: string;
  rh: string;
};

/** Ensure the full Zafirix Pro folder structure exists in Drive. */
export async function ensureZafirixFolderStructure(
  accessToken: string,
  companyName: string,
): Promise<ZafirixFolderIds> {
  const root = await findOrCreateFolder(accessToken, 'root', 'Zafirix Pro');
  const company = await findOrCreateFolder(accessToken, root, companyName || 'Mon entreprise');
  const [documentsIa, factures, comptabilite, rapports, juridique, rh] = await Promise.all([
    findOrCreateFolder(accessToken, company, 'Documents IA'),
    findOrCreateFolder(accessToken, company, 'Factures'),
    findOrCreateFolder(accessToken, company, 'Comptabilité'),
    findOrCreateFolder(accessToken, company, 'Rapports'),
    findOrCreateFolder(accessToken, company, 'Juridique'),
    findOrCreateFolder(accessToken, company, 'RH'),
  ]);
  return { root, company, documentsIa, factures, comptabilite, rapports, juridique, rh };
}

// ── File upload ───────────────────────────────────────────────────────────────

export type DriveUploadResult = {
  id: string;
  webViewLink: string;
};

/**
 * Upload a file to Google Drive using multipart upload.
 * Returns { id, webViewLink }.
 */
export async function uploadFileToDrive(
  accessToken: string,
  folderId: string,
  filename: string,
  mimeType: string,
  content: Buffer | string,
): Promise<DriveUploadResult> {
  const boundary = `zafirix_mp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const contentBuffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });

  // Build multipart/related body
  const headerPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf-8',
  );
  const footerPart = Buffer.from(`\r\n--${boundary}--`, 'utf-8');
  const body = Buffer.concat([headerPart, contentBuffer, footerPart]);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive upload failed (${res.status}): ${err}`);
  }

  return res.json() as Promise<DriveUploadResult>;
}

// ── MIME helpers ──────────────────────────────────────────────────────────────

export function mimeTypeForFormat(format: string): string {
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    json: 'application/json',
    csv: 'text/csv',
    xml: 'application/xml',
    zip: 'application/zip',
  };
  return map[format] ?? 'application/octet-stream';
}
