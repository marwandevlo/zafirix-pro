/**
 * Client portal share links — production-safe URLs for invoice upload & tracking.
 */

import {
  absoluteUrl,
  getPortalBaseUrl,
  isDedicatedPortalHost,
} from '@/app/lib/atlas-app-url';

/** URL-safe portal access code (alphanumeric + hyphen, max 32). */
export function normalizePortalAccessCode(raw: string): string | null {
  const code = raw.trim();
  if (!code || code.length > 32) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(code)) return null;
  return code;
}

/** Path segment for portal entry (subdomain uses /{code}, main app uses /portal/{code}). */
export function buildClientPortalPath(companyCode: string): string | null {
  const code = normalizePortalAccessCode(companyCode);
  if (!code) return null;
  if (isDedicatedPortalHost()) return `/${encodeURIComponent(code)}`;
  return `/portal/${encodeURIComponent(code)}`;
}

/** Full shareable URL for clients (WhatsApp, email, SMS). */
export function buildClientPortalUrl(companyCode: string): string | null {
  const path = buildClientPortalPath(companyCode);
  if (!path) return null;
  return absoluteUrl(path, getPortalBaseUrl());
}

/** Parse code from /portal/[code] or dedicated-host /[code]. */
export function parseClientPortalCodeFromPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'portal' && segments[1]) {
    return normalizePortalAccessCode(decodeURIComponent(segments[1]));
  }
  if (isDedicatedPortalHost() && segments.length === 1) {
    return normalizePortalAccessCode(decodeURIComponent(segments[0]));
  }
  return null;
}

/** Human-readable label for accountant UI copy buttons. */
export function formatClientPortalLinkLabel(companyCode: string): string {
  const url = buildClientPortalUrl(companyCode);
  return url ?? buildClientPortalPath(companyCode) ?? `/portal/${companyCode}`;
}

/** Read portal access code from company row / company_json fields. */
export function resolvePortalCodeFromCompany(company: {
  clientPortalCode?: string;
  client_portal_code?: string;
}): string | null {
  const raw = String(company.clientPortalCode ?? company.client_portal_code ?? '').trim();
  return normalizePortalAccessCode(raw);
}

export type PortalCodeCompanyInput = {
  clientPortalCode?: string;
  client_portal_code?: string;
  raisonSociale?: string;
  tradeName?: string;
  legalName?: string;
  id?: number | string;
  dbRowId?: string;
};

/** Slugify company name into a URL-safe portal code (e.g. "L2T Maroc Service" → "l2t-maroc-service"). */
export function slugifyPortalAccessCode(raw: string): string | null {
  const slug = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  if (!slug) return null;
  return normalizePortalAccessCode(slug);
}

function portalCodeFromCompanyId(id: number | string): string {
  const compact = String(id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
  const raw = compact ? `company-${compact}` : 'company-unknown';
  return normalizePortalAccessCode(raw.slice(0, 32)) ?? 'company-unknown';
}

/**
 * Resolve a portal access code with fallbacks:
 * explicit code → slugified name → company-[id].
 */
export function resolvePortalCodeForCompany(company: PortalCodeCompanyInput): string {
  const explicit = resolvePortalCodeFromCompany(company);
  if (explicit) return explicit;

  const name = String(
    company.tradeName ?? company.raisonSociale ?? company.legalName ?? '',
  ).trim();
  const fromName = name ? slugifyPortalAccessCode(name) : null;
  if (fromName) return fromName;

  const id = company.dbRowId ?? company.id;
  if (id !== undefined && id !== null && String(id).trim()) {
    return portalCodeFromCompanyId(id);
  }

  return 'company-default';
}

/** Build share URL from company metadata (always returns a valid URL). */
export function buildClientPortalUrlForCompany(company: PortalCodeCompanyInput): string {
  const code = resolvePortalCodeForCompany(company);
  return buildClientPortalUrl(code) ?? absoluteUrl(`/portal/${encodeURIComponent(code)}`, getPortalBaseUrl());
}
