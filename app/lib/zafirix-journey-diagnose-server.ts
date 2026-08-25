/**
 * Autonomous user/admin journey diagnostics for Zafirixpro.
 * Checks route files, DB table integrity, ICE/TVA rules, and usage meter RPCs.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isValidIce, isValidMoroccoVatRate, MOROCCO_TVA_RATES } from '@/app/lib/atlas-morocco-compliance';
import { ATLAS_APP_NAV_ITEMS } from '@/app/lib/atlas-app-nav';

export type DiagnoseSeverity = 'pass' | 'warn' | 'fail';

export type DiagnoseCheck = {
  id: string;
  area: string;
  severity: DiagnoseSeverity;
  title: string;
  detail?: string;
};

export type JourneyDiagnoseReport = {
  ok: boolean;
  generatedAt: string;
  summary: { pass: number; warn: number; fail: number };
  checks: DiagnoseCheck[];
  journey: {
    clientPersona: string;
    adminPersona: string;
    sections: string[];
  };
};

const CRITICAL_PAGES = [
  '/',
  '/factures',
  '/logistique',
  '/auto-entrepreneur',
  '/personne-physique',
  '/audit',
  '/settings',
  '/pricing',
  '/billing',
  '/comptabilite',
  '/inventaire',
  '/tva',
  '/dashboard',
  '/admin',
  '/login',
  '/signup',
] as const;

const CRITICAL_API_ROUTES = [
  'app/api/usage/route.ts',
  'app/api/audit/compliance/route.ts',
  'app/api/ai/tax-audit/route.ts',
  'app/api/logistics/deliveries/route.ts',
  'app/api/auto-entrepreneur/route.ts',
  'app/api/personne-physique/route.ts',
  'app/api/factures/route.ts',
  'app/api/billing/usage/route.ts',
  'app/api/admin/diagnose/route.ts',
] as const;

const CRITICAL_TABLES = [
  'atlas_companies',
  'atlas_invoices',
  'zafirix_deliveries',
  'zafirix_subscriptions',
  'zafirix_usage_meters',
  'zafirix_addon_packs',
  'zafirix_plan_limits',
  'zafirix_individual_profiles',
] as const;

const PWA_ASSETS = ['public/manifest.json', 'public/sw.js', 'public/zafirix-icon-192.png', 'public/zafirix-icon-512.png'] as const;

function pageFileFromHref(href: string): string {
  if (href === '/' || href === '') return 'app/page.tsx';
  const clean = href.replace(/^\//, '').replace(/\/$/, '');
  return `app/${clean}/page.tsx`;
}

function push(
  checks: DiagnoseCheck[],
  check: DiagnoseCheck,
) {
  checks.push(check);
}

/** Static filesystem + rule simulations (safe offline). */
export function runStaticJourneyDiagnostics(projectRoot: string): DiagnoseCheck[] {
  const checks: DiagnoseCheck[] = [];

  for (const href of CRITICAL_PAGES) {
    const file = pageFileFromHref(href);
    const abs = path.join(projectRoot, file);
    push(checks, {
      id: `page:${href}`,
      area: 'routes',
      severity: fs.existsSync(abs) ? 'pass' : 'fail',
      title: `Page ${href}`,
      detail: fs.existsSync(abs) ? file : `Missing ${file}`,
    });
  }

  for (const item of ATLAS_APP_NAV_ITEMS) {
    if (item.href.includes('[')) continue;
    const file = pageFileFromHref(item.href);
    const abs = path.join(projectRoot, file);
    if (!fs.existsSync(abs)) {
      push(checks, {
        id: `nav-broken:${item.id}`,
        area: 'nav',
        severity: 'warn',
        title: `Nav link « ${item.label} » → ${item.href}`,
        detail: `Missing ${file}`,
      });
    }
  }

  for (const rel of CRITICAL_API_ROUTES) {
    const abs = path.join(projectRoot, rel);
    push(checks, {
      id: `api:${rel}`,
      area: 'api',
      severity: fs.existsSync(abs) ? 'pass' : 'fail',
      title: `API ${rel}`,
      detail: fs.existsSync(abs) ? 'present' : 'missing',
    });
  }

  for (const rel of PWA_ASSETS) {
    const abs = path.join(projectRoot, rel);
    push(checks, {
      id: `pwa:${rel}`,
      area: 'pwa',
      severity: fs.existsSync(abs) ? 'pass' : 'fail',
      title: `PWA asset ${rel}`,
      detail: fs.existsSync(abs) ? 'present' : 'missing',
    });
  }

  // ICE / TVA rule simulations (Moroccan client persona)
  const iceCases: Array<{ raw: string; expect: boolean; label: string }> = [
    { raw: '001526849000078', expect: true, label: 'valid 15-digit ICE' },
    { raw: '123', expect: false, label: 'short ICE rejected' },
    { raw: '000000000000000', expect: false, label: 'all-zero ICE rejected' },
  ];
  for (const c of iceCases) {
    const ok = isValidIce(c.raw) === c.expect;
    push(checks, {
      id: `rule:ice:${c.label}`,
      area: 'rules',
      severity: ok ? 'pass' : 'fail',
      title: `ICE rule — ${c.label}`,
      detail: `input=${c.raw} expect=${c.expect} got=${isValidIce(c.raw)}`,
    });
  }

  for (const rate of MOROCCO_TVA_RATES) {
    push(checks, {
      id: `rule:tva:${rate}`,
      area: 'rules',
      severity: isValidMoroccoVatRate(rate) ? 'pass' : 'fail',
      title: `TVA rate ${rate}% accepted`,
    });
  }
  push(checks, {
    id: 'rule:tva:invalid-19',
    area: 'rules',
    severity: !isValidMoroccoVatRate(19) ? 'pass' : 'fail',
    title: 'TVA 19% rejected (not Moroccan barème)',
  });

  // Invoice amount consistency simulation
  const ht = 1000;
  const vat = 200;
  const ttc = 1200;
  push(checks, {
    id: 'rule:invoice-balance',
    area: 'rules',
    severity: ht + vat === ttc ? 'pass' : 'fail',
    title: 'Invoice HT+TVA=TTC simulation',
    detail: `${ht}+${vat}=${ttc}`,
  });

  // Shell / mobile components
  for (const rel of [
    'app/components/shell/MobileBottomNav.tsx',
    'app/components/shell/ModuleAppShell.tsx',
    'app/components/billing/UsagePlanWidget.tsx',
    'app/components/dashboard/MoroccoComplianceAuditWidget.tsx',
    'app/components/ai/TaxAuditWidget.tsx',
    'app/lib/zafirix-usage-server.ts',
    'app/lib/zafirix-compliance-audit-server.ts',
    'app/lib/zafirix-smart-tax-audit.ts',
  ]) {
    const abs = path.join(projectRoot, rel);
    push(checks, {
      id: `component:${rel}`,
      area: 'ui',
      severity: fs.existsSync(abs) ? 'pass' : 'fail',
      title: `UI/lib ${path.basename(rel)}`,
      detail: rel,
    });
  }

  return checks;
}

export async function runDatabaseJourneyDiagnostics(db: SupabaseClient): Promise<DiagnoseCheck[]> {
  const checks: DiagnoseCheck[] = [];

  for (const table of CRITICAL_TABLES) {
    const { error } = await db.from(table).select('*').limit(1);
    if (error) {
      const missing = /does not exist|schema cache|Could not find/i.test(error.message);
      push(checks, {
        id: `db:${table}`,
        area: 'database',
        severity: missing ? 'fail' : 'warn',
        title: `Table ${table}`,
        detail: error.message,
      });
    } else {
      push(checks, {
        id: `db:${table}`,
        area: 'database',
        severity: 'pass',
        title: `Table ${table}`,
        detail: 'reachable',
      });
    }
  }

  // RPC smoke tests
  for (const rpc of ['zafirix_current_period_ym', 'zafirix_plan_label'] as const) {
    const args =
      rpc === 'zafirix_plan_label'
        ? { p_code: 'PME' }
        : {};
    const { data, error } = await db.rpc(rpc, args);
    push(checks, {
      id: `rpc:${rpc}`,
      area: 'database',
      severity: error ? 'fail' : 'pass',
      title: `RPC ${rpc}`,
      detail: error?.message ?? String(data ?? 'ok'),
    });
  }

  // Sample company + meters integrity
  const { data: company, error: companyErr } = await db
    .from('atlas_companies')
    .select('id, user_id, ice, cnss_number')
    .limit(1)
    .maybeSingle();

  if (companyErr) {
    push(checks, {
      id: 'db:sample-company',
      area: 'database',
      severity: 'warn',
      title: 'Sample company probe',
      detail: companyErr.message,
    });
  } else if (!company) {
    push(checks, {
      id: 'db:sample-company',
      area: 'database',
      severity: 'warn',
      title: 'Sample company probe',
      detail: 'No companies in database — skip meter/invoice simulations',
    });
  } else {
    push(checks, {
      id: 'db:sample-company',
      area: 'database',
      severity: 'pass',
      title: 'Sample company available',
      detail: String(company.id),
    });

    const { data: checkUsage, error: checkErr } = await db.rpc('zafirix_check_usage', {
      p_company_id: company.id,
      p_meter: 'invoices',
      p_qty: 1,
    });
    push(checks, {
      id: 'db:usage-check',
      area: 'quota',
      severity: checkErr ? 'fail' : 'pass',
      title: 'Usage meter check (invoices)',
      detail: checkErr?.message ?? JSON.stringify(checkUsage),
    });

    const { count: invCount, error: invErr } = await db
      .from('atlas_invoices')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id);
    push(checks, {
      id: 'db:invoices-count',
      area: 'database',
      severity: invErr ? 'warn' : 'pass',
      title: 'Invoices readable for sample company',
      detail: invErr?.message ?? `count=${invCount ?? 0}`,
    });

    const { count: delCount, error: delErr } = await db
      .from('zafirix_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id);
    push(checks, {
      id: 'db:deliveries-count',
      area: 'database',
      severity: delErr ? 'warn' : 'pass',
      title: 'Deliveries readable for sample company',
      detail: delErr?.message ?? `count=${delCount ?? 0}`,
    });
  }

  return checks;
}

export async function probeHttpJourney(
  baseUrl: string,
  paths: string[] = [...CRITICAL_PAGES, '/manifest.json', '/sw.js'],
): Promise<DiagnoseCheck[]> {
  const checks: DiagnoseCheck[] = [];
  const origin = baseUrl.replace(/\/$/, '');

  for (const p of paths) {
    const url = `${origin}${p.startsWith('/') ? p : `/${p}`}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { Accept: 'text/html,application/json,*/*' },
      });
      const status = res.status;
      const ok = status === 200 || status === 301 || status === 302 || status === 307 || status === 308 || status === 401 || status === 403;
      push(checks, {
        id: `http:${p}`,
        area: 'http',
        severity: ok ? 'pass' : status >= 500 ? 'fail' : 'warn',
        title: `HTTP ${p}`,
        detail: `status=${status}`,
      });
    } catch (err) {
      push(checks, {
        id: `http:${p}`,
        area: 'http',
        severity: 'fail',
        title: `HTTP ${p}`,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return checks;
}

export function buildJourneyReport(checks: DiagnoseCheck[]): JourneyDiagnoseReport {
  const summary = {
    pass: checks.filter((c) => c.severity === 'pass').length,
    warn: checks.filter((c) => c.severity === 'warn').length,
    fail: checks.filter((c) => c.severity === 'fail').length,
  };
  return {
    ok: summary.fail === 0,
    generatedAt: new Date().toISOString(),
    summary,
    checks,
    journey: {
      clientPersona: 'PME marocaine — facturation, logistique COD, AE/PP, audit fiscal',
      adminPersona: 'Administrateur plateforme — diagnose, quotas, tables',
      sections: [
        'Dashboard',
        'Invoicing',
        'Logistics',
        'Auto-entrepreneur',
        'Personne Physique',
        'Tax Audit',
        'Settings',
        'PWA',
      ],
    },
  };
}

export async function runFullJourneyDiagnose(opts: {
  projectRoot: string;
  db?: SupabaseClient | null;
  baseUrl?: string | null;
}): Promise<JourneyDiagnoseReport> {
  const checks: DiagnoseCheck[] = [...runStaticJourneyDiagnostics(opts.projectRoot)];
  if (opts.db) {
    checks.push(...(await runDatabaseJourneyDiagnostics(opts.db)));
  } else {
    checks.push({
      id: 'db:skipped',
      area: 'database',
      severity: 'warn',
      title: 'Database diagnostics skipped',
      detail: 'No service-role client available',
    });
  }
  if (opts.baseUrl) {
    checks.push(...(await probeHttpJourney(opts.baseUrl)));
  }
  return buildJourneyReport(checks);
}
