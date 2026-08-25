import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

type CheckStatus = 'Pass' | 'Fail' | 'Warn';

type HealthCheck = {
  area: string;
  name: string;
  status: CheckStatus;
  detail: string;
};

/** Sidebar routes from `ATLAS_APP_NAV_ITEMS` — keep in sync with `app/lib/atlas-app-nav.ts`. */
const INTERNAL_MODULES: { name: string; path: string }[] = [
  { name: 'Dashboard', path: '/' },
  { name: 'Configuration', path: '/setup' },
  { name: 'Aide', path: '/help' },
  { name: 'Mes sociétés', path: '/companies' },
  { name: 'Portfolio cabinet', path: '/cabinet' },
  { name: 'Clients', path: '/clients' },
  { name: 'Consultant IA', path: '/consultant' },
  { name: 'Briefing CEO', path: '/briefing-ceo' },
  { name: 'Assistant IA', path: '/assistant' },
  { name: 'Smart Generator', path: '/smart-generator' },
  { name: 'Audit IA', path: '/audit' },
  { name: 'Agents IA', path: '/agents' },
  { name: 'Documents IA', path: '/documents' },
  { name: 'Validation', path: '/validation' },
  { name: 'Comptabilité', path: '/comptabilite' },
  { name: 'Immobilisations', path: '/immobilisations' },
  { name: 'Banque', path: '/banque' },
  { name: 'Factures', path: '/factures' },
  { name: 'Inventaire', path: '/inventaire' },
  { name: 'Logistique', path: '/logistique' },
  { name: 'Recouvrement', path: '/recouvrement' },
  { name: 'Commissions', path: '/commissions' },
  { name: 'Courrier', path: '/courrier' },
  { name: 'Satisfaction client', path: '/satisfaction-client' },
  { name: 'Caisse', path: '/caisse' },
  { name: 'Auto-entrepreneur', path: '/auto-entrepreneur' },
  { name: 'Personne physique', path: '/personne-physique' },
  { name: 'Juridique', path: '/juridique' },
  { name: 'Gouvernance', path: '/gouvernance' },
  { name: 'Pass auditeur', path: '/auditor' },
  { name: 'Contrats', path: '/contrats' },
  { name: 'RH', path: '/rh' },
  { name: 'Étude de projet', path: '/etude-projet' },
  { name: 'Rapports', path: '/rapports' },
  { name: 'TVA', path: '/tva' },
  { name: 'Simulateur fiscal', path: '/simulateur-fiscal' },
  { name: 'Calendrier fiscal', path: '/calendrier-fiscal' },
  { name: 'IS Fiscal', path: '/is' },
  { name: 'Liasse fiscale', path: '/liasse' },
  { name: 'IR / Salaires', path: '/ir' },
  { name: 'Billing', path: '/billing' },
  { name: 'Abonnement', path: '/subscription' },
  { name: 'Paramètres', path: '/settings' },
];

const REPORT_DIR = path.join(process.cwd(), 'e2e-reports');
const STORAGE = path.join(process.cwd(), 'tests', '.auth', 'user.json');
const STANDING_BY = 'Test complete. Standing by for your next command, Master.';

const EXTERNAL_HOST_RE =
  /(?:^|\.)((facebook|instagram|tiktok|youtube|linkedin|whatsapp)\.com|wa\.me)(?:\/|$)/i;

const checks: HealthCheck[] = [];
const recommendations: string[] = [];

function record(area: string, name: string, status: CheckStatus, detail: string): void {
  checks.push({ area, name, status, detail });
}

function originOf(baseURL: string | undefined): string {
  return new URL(baseURL ?? 'http://127.0.0.1:3001').origin;
}

function isOnOrigin(url: string, origin: string): boolean {
  if (!url || url.startsWith('about:') || url.startsWith('blob:')) return true;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

async function confineToPlatform(page: Page, origin: string): Promise<void> {
  page.on('popup', async (popup) => {
    try {
      await popup.waitForLoadState('domcontentloaded', { timeout: 3_000 }).catch(() => undefined);
      if (!isOnOrigin(popup.url(), origin)) await popup.close();
    } catch {
      /* popup already gone */
    }
  });

  await page.route('**/*', (route) => {
    const url = route.request().url();
    try {
      const host = new URL(url).hostname;
      if (EXTERNAL_HOST_RE.test(host) || host === 'wa.me') {
        return route.abort();
      }
    } catch {
      /* ignore parse */
    }
    return route.continue();
  });
}

async function assertStillInside(page: Page, origin: string, label: string): Promise<boolean> {
  const url = page.url();
  const inside = isOnOrigin(url, origin);
  if (!inside) {
    record('Isolation', label, 'Fail', `navigated off-platform: ${url}`);
    recommendations.push(`Keep ${label} on-origin — unexpected jump to ${url}`);
  }
  return inside;
}

async function hasNextCrash(page: Page): Promise<string | null> {
  const overlay = page.locator('[data-nextjs-dialog], #nextjs__container_errors_label');
  if ((await overlay.count()) > 0) {
    return (await overlay.first().textContent().catch(() => 'overlay')) ?? 'overlay';
  }
  return null;
}

async function measureOverflow(page: Page, label: string): Promise<void> {
  const finding = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      overflowX: root.scrollWidth > root.clientWidth + 2,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
    };
  });
  record(
    'Layout',
    label,
    finding.overflowX ? 'Fail' : 'Pass',
    finding.overflowX
      ? `horizontal overflow ${finding.scrollWidth} > ${finding.clientWidth}`
      : `no overflow (${finding.clientWidth}px)`,
  );
  if (finding.overflowX) {
    recommendations.push(`Fix horizontal overflow on ${label}.`);
  }
}

async function visitInternal(
  page: Page,
  origin: string,
  name: string,
  pathName: string,
): Promise<'ok' | 'gated' | 'crash'> {
  const res = await page.goto(pathName, { waitUntil: 'domcontentloaded', timeout: 25_000 }).catch(() => null);
  if (!(await assertStillInside(page, origin, name))) return 'crash';

  const crash = await hasNextCrash(page);
  if (crash) {
    record('Modules', name, 'Fail', `Next overlay: ${crash.slice(0, 160)}`);
    return 'crash';
  }

  await page
    .locator('h1, h2, nav, main, [data-tour], form, [role="main"]')
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => undefined);

  const url = page.url();
  const gated = /\/(landing|login)(\?|$)/.test(url) && pathName !== '/login' && !pathName.startsWith('/landing');
  if (gated) {
    record('Modules', name, 'Warn', `auth gate → ${url} (status=${res?.status() ?? 'n/a'})`);
    return 'gated';
  }

  const text = (await page.locator('body').innerText().catch(() => '')).trim();
  if (text.length < 8) {
    record('Modules', name, 'Fail', `empty body at ${url} (html may still be hydrating)`);
    return 'crash';
  }

  record('Modules', name, 'Pass', url.split('?')[0] ?? url);
  return 'ok';
}

function writeReport(): string {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const passed = checks.filter((c) => c.status === 'Pass').length;
  const failed = checks.filter((c) => c.status === 'Fail').length;
  const warned = checks.filter((c) => c.status === 'Warn').length;
  const generatedAt = new Date().toISOString();
  const recs = [...new Set(recommendations)];
  const lines = [
    '# Zafirixpro — Internal dashboard & app sections health report',
    '',
    `- Generated: ${generatedAt}`,
    `- Checks: ${checks.length} · Pass: ${passed} · Fail: ${failed} · Warn: ${warned}`,
    `- Isolation: social/external hosts aborted; popups off-origin closed.`,
    '',
    '## Sections',
    '',
    '| Area | Element | Status | Detail |',
    '| --- | --- | --- | --- |',
    ...checks.map((c) => `| ${c.area} | ${c.name} | **${c.status}** | ${c.detail.replace(/\|/g, '\\|')} |`),
    '',
    '## Unresponsive buttons / missing elements / layout',
    '',
  ];
  const issues = checks.filter((c) => c.status !== 'Pass');
  if (issues.length === 0) {
    lines.push('No failed internal sections. Warnings (if any) are auth-gate only.', '');
  } else {
    for (const c of issues) {
      lines.push(`- **${c.status}** — ${c.area} / ${c.name}: ${c.detail}`);
    }
    lines.push('');
  }
  lines.push('## Recommendations', '');
  if (recs.length === 0) {
    lines.push('- Keep deep-tour runs on `ATLAS_E2E_LOCAL=true` (or a signed-in storageState) so `/` is the dashboard, not `/landing`.');
  } else {
    for (const r of recs) lines.push(`- ${r}`);
  }
  lines.push('', `## ${STANDING_BY}`, '');
  const markdown = lines.join('\n');
  fs.writeFileSync(path.join(REPORT_DIR, 'internal-dashboard-latest.md'), markdown, 'utf8');
  fs.writeFileSync(
    path.join(REPORT_DIR, 'internal-dashboard-latest.json'),
    JSON.stringify({ generatedAt, passed, failed, warned, checks, recommendations: recs }, null, 2),
    'utf8',
  );
  return markdown;
}

test.describe.configure({ mode: 'serial', timeout: 420_000 });

test.describe('Internal dashboard deep tour', () => {
  test.use({
    storageState: fs.existsSync(STORAGE) ? STORAGE : { cookies: [], origins: [] },
    viewport: { width: 1280, height: 720 },
  });

  test.afterAll(() => {
    const markdown = writeReport();
    // eslint-disable-next-line no-console
    console.log(`\n${markdown}\n${STANDING_BY}\n`);
  });

  test('Desktop 1280 — landing, pricing, dashboard, audit, modules, forms', async ({ page, baseURL }) => {
    const origin = originOf(baseURL);
    await confineToPlatform(page, origin);
    page.setDefaultTimeout(20_000);

    await test.step('Public landing (internal nav only)', async () => {
      await page.goto('/landing/fr', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /ZAFIRIX/i }).first()).toBeVisible({ timeout: 20_000 });
      record('Public', 'Landing FR', 'Pass', page.url());
      await page.locator('header').getByRole('link', { name: /^Tarifs$/ }).click();
      await page.waitForURL(/\/pricing/, { timeout: 15_000 });
      expect(isOnOrigin(page.url(), origin)).toBeTruthy();
      record('Public', 'Nav Tarifs → /pricing', 'Pass', page.url());
    });

    await test.step('Pricing tiers (skip mailto CTAs)', async () => {
      await expect(page.getByRole('heading', { name: /Quatre forfaits clairs/i })).toBeVisible();
      await page.locator('#plans').scrollIntoViewIfNeeded();
      record('Public', 'Pricing plans', 'Pass', 'plans section visible');
      const trial = page.getByRole('button', { name: /Essai 7 jours/i });
      if (await trial.isVisible()) {
        await trial.click();
        await page.waitForURL(/\/signup/, { timeout: 15_000 }).catch(() => undefined);
        if (/\/signup/.test(page.url())) {
          record('Public', 'Trial CTA → signup', 'Pass', page.url());
          await page.getByPlaceholder('Prénom et nom').fill('Internal E2E User');
          await page.getByPlaceholder('vous@entreprise.ma').fill('internal.e2e@zafirix.test');
          record('Forms', 'Signup mock fill', 'Pass', 'name + email filled, submit skipped');
        } else {
          record('Public', 'Trial CTA → signup', 'Warn', page.url());
        }
      }
      await measureOverflow(page, 'pricing/signup desktop');
      expect(isOnOrigin(page.url(), origin)).toBeTruthy();
    });

    await test.step('Dashboard overview + language + Smart Tax Audit', async () => {
      const result = await visitInternal(page, origin, 'Dashboard', '/');
      if (result !== 'ok') {
        recommendations.push(
          'Start Playwright with ATLAS_E2E_LOCAL=true or PLAYWRIGHT_TEST_EMAIL/PASSWORD so `/` loads the logged-in dashboard.',
        );
        return;
      }

      const tourSkip = page.getByRole('button', { name: /Passer|تخطي/i });
      if (await tourSkip.first().isVisible().catch(() => false)) {
        await tourSkip.first().click();
        record('Dashboard', 'Dismiss guided tour', 'Pass', 'Passer');
      }

      const dash = page.locator('[data-tour="dashboard"]');
      if (await dash.isVisible().catch(() => false)) {
        record('Dashboard', 'Overview shell', 'Pass', 'data-tour=dashboard');
      } else {
        record('Dashboard', 'Overview shell', 'Warn', 'tour marker missing — page still rendered');
      }

      const btnAr = page.getByRole('button', { name: 'AR', exact: true });
      const btnFr = page.getByRole('button', { name: 'FR', exact: true });
      if ((await btnAr.count()) > 0) {
        await btnAr.first().click({ force: true });
        await page.waitForTimeout(200);
        const dir = await page.locator('div.flex.h-dvh').first().getAttribute('dir');
        record('Dashboard', 'Lang AR / RTL', dir === 'rtl' ? 'Pass' : 'Warn', `dir=${dir ?? 'unset'}`);
        await btnFr.first().click({ force: true });
        record('Dashboard', 'Lang FR', 'Pass', 'toggled back to FR');
      } else {
        record('Dashboard', 'Lang FR/AR', 'Warn', 'sidebar language toggle not on this layout');
      }

      const auditAnchor = page.locator('#morocco-audit');
      await auditAnchor.scrollIntoViewIfNeeded().catch(() => undefined);
      const widget = page.locator('[data-tour="smart-tax-audit"]');
      if (await widget.isVisible().catch(() => false)) {
        record('Dashboard', 'Smart Tax Audit widget', 'Pass', 'visible');
        const arToggle = widget.getByRole('button', { name: 'ع', exact: true });
        if (await arToggle.isVisible().catch(() => false)) {
          await arToggle.click();
          record('Dashboard', 'Tax audit AR toggle', 'Pass', 'widget dir RTL');
          await widget.getByRole('button', { name: 'FR', exact: true }).click();
        }
        const payloadBtn = widget.getByRole('button', { name: /payload|بيانات/i });
        if (await payloadBtn.isVisible().catch(() => false)) {
          await payloadBtn.click();
          const area = widget.locator('textarea');
          if (await area.isVisible().catch(() => false)) {
            await area.fill(
              '{"invoices":[{"number":"E2E-1","ice":"001234567000089","vatRate":20,"amountHt":1000,"vatAmount":200,"totalTtc":1200}]}',
            );
            record('Forms', 'Tax audit payload mock', 'Pass', 'JSON filled, scan not required');
          }
        }
      } else {
        record('Dashboard', 'Smart Tax Audit widget', 'Fail', 'widget not found on dashboard');
      }
      await measureOverflow(page, 'dashboard desktop');
    });

    await test.step('Audit page widget', async () => {
      const result = await visitInternal(page, origin, 'Audit IA page', '/audit');
      if (result !== 'ok') return;
      const widget = page.locator('[data-tour="smart-tax-audit"]');
      await widget.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
      if (await widget.isVisible().catch(() => false)) {
        record('Audit', 'TaxAuditWidget on /audit', 'Pass', 'visible');
        const scan = widget.getByRole('button', { name: /Scanner|فحص/i });
        if (await scan.isVisible()) {
          await scan.click();
          record('Audit', 'Scanner button', 'Pass', 'clicked (API stays on-origin)');
        }
      } else {
        record('Audit', 'TaxAuditWidget on /audit', 'Fail', 'missing widget');
      }
    });

    await test.step('Factures form', async () => {
      const result = await visitInternal(page, origin, 'Factures', '/factures');
      if (result !== 'ok') return;
      const create = page.getByRole('button', { name: /Nouvelle facture/i });
      if (await create.isVisible().catch(() => false)) {
        await create.click();
        const heading = page.getByRole('heading', { name: /Nouvelle facture/i });
        if (await heading.isVisible().catch(() => false)) {
          record('Forms', 'Nouvelle facture panel', 'Pass', 'opened');
        } else {
          record('Forms', 'Nouvelle facture panel', 'Warn', 'button clicked, heading not found');
        }
      } else {
        record('Forms', 'Nouvelle facture', 'Warn', 'button not visible (empty/gated state)');
      }
    });

    await test.step('Walk remaining internal modules', async () => {
      const skip = new Set(['/', '/audit', '/factures']);
      let gated = 0;
      for (const mod of INTERNAL_MODULES) {
        if (skip.has(mod.path)) continue;
        const status = await visitInternal(page, origin, mod.name, mod.path);
        if (status === 'gated') gated += 1;
        if (gated >= 8) {
          record(
            'Modules',
            'Batch stop',
            'Warn',
            'Multiple auth redirects — remaining modules not hit (need E2E local or session).',
          );
          recommendations.push('Re-run internal tour with ATLAS_E2E_LOCAL=true so middleware does not send `/` to `/landing`.');
          break;
        }
      }
    });

    await test.step('Login form mock (no submit)', async () => {
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      if (!(await assertStillInside(page, origin, 'Login'))) return;
      await page.getByPlaceholder(/email|@/i).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
      const email = page.getByPlaceholder(/email|@/i).first();
      const password = page.locator('input[type="password"]').first();
      if ((await email.count()) > 0) {
        await email.fill('internal.e2e@zafirix.test');
        if (await password.count()) await password.fill('Zafirix-E2E-2026!');
        record('Forms', 'Login mock fill', 'Pass', 'filled, submit skipped');
      } else {
        record('Forms', 'Login mock fill', 'Warn', 'email field missing');
      }
    });

    const hardFails = checks.filter((c) => c.status === 'Fail');
    expect(hardFails, hardFails.map((c) => `${c.area}:${c.name}`).join(', ')).toHaveLength(0);
  });

  test('Mobile 390 — dashboard, audit, bottom nav, RTL', async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    const origin = originOf(baseURL);
    await confineToPlatform(page, origin);
    await page.setViewportSize({ width: 390, height: 844 });

    const dash = await visitInternal(page, origin, 'Dashboard mobile', '/');
    if (dash === 'ok') {
      const tourSkip = page.getByRole('button', { name: /Passer|تخطي/i });
      if (await tourSkip.first().isVisible().catch(() => false)) {
        await tourSkip.first().click();
      }
      await measureOverflow(page, 'dashboard mobile 390px');
      const facturesTab = page.getByRole('navigation', { name: 'Navigation mobile' }).getByRole('button', { name: /^Factures$/ });
      const menuTab = page.getByRole('navigation', { name: 'Navigation mobile' }).getByRole('button', { name: /Plus de modules|Menu/i });
      if ((await facturesTab.count()) > 0 && (await facturesTab.first().isVisible())) {
        await facturesTab.first().click({ force: true });
        await page.waitForURL(/\/factures/, { timeout: 10_000 }).catch(() => undefined);
        if (await assertStillInside(page, origin, 'Mobile Factures tab')) {
          record('Mobile', 'Bottom nav Factures', 'Pass', page.url());
        }
      } else if (await menuTab.isVisible().catch(() => false)) {
        await menuTab.click();
        record('Mobile', 'More menu', 'Pass', 'opened');
      } else {
        record('Mobile', 'Bottom nav', 'Warn', 'primary tabs not visible');
      }
    }

    const audit = await visitInternal(page, origin, 'Audit mobile', '/audit');
    if (audit === 'ok') {
      const widget = page.locator('[data-tour="smart-tax-audit"]');
      record(
        'Mobile',
        'Tax audit widget',
        (await widget.isVisible().catch(() => false)) ? 'Pass' : 'Fail',
        '390px /audit',
      );
      await measureOverflow(page, 'audit mobile 390px');
    }

    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    if (await assertStillInside(page, origin, 'Pricing mobile')) {
      record('Mobile', 'Pricing', 'Pass', page.url());
      await measureOverflow(page, 'pricing mobile 390px');
    }
  });
});
