import { test, expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

type CheckStatus = 'Pass' | 'Fail' | 'Warn';

type JourneyCheck = {
  id: string;
  area: string;
  name: string;
  status: CheckStatus;
  detail: string;
};

type OverflowFinding = {
  viewport: string;
  overflowX: boolean;
  scrollWidth: number;
  clientWidth: number;
  offenders: string[];
};

const SOCIAL_EXPECTATIONS = [
  {
    name: 'WhatsApp',
    hrefIncludes: 'wa.me/212665425852',
    requireBlank: true,
  },
  {
    name: 'Facebook',
    hrefIncludes: 'facebook.com/people/zafirixpro',
    requireBlank: true,
  },
  {
    name: 'Instagram',
    hrefIncludes: 'instagram.com/zafirixpro',
    requireBlank: true,
  },
  {
    name: 'YouTube',
    hrefIncludes: 'youtube.com/@ZafrixPro',
    requireBlank: true,
  },
  {
    name: 'TikTok',
    hrefIncludes: 'tiktok.com/@zafrix.pro',
    requireBlank: true,
  },
] as const;

const REPORT_DIR = path.join(process.cwd(), 'e2e-reports');
const STANDING_BY = 'Test complete. Standing by for your next command, Master.';

const checks: JourneyCheck[] = [];
const overflows: OverflowFinding[] = [];
const recommendations: string[] = [];

function record(area: string, name: string, status: CheckStatus, detail: string): void {
  checks.push({
    id: `${area}:${name}`.toLowerCase().replace(/\s+/g, '-'),
    area,
    name,
    status,
    detail,
  });
}

async function measureOverflow(page: Page, viewport: string): Promise<OverflowFinding> {
  const finding = await page.evaluate((label) => {
    const root = document.documentElement;
    const clientWidth = root.clientWidth;
    const scrollWidth = root.scrollWidth;
    const overflowX = scrollWidth > clientWidth + 2;
    const offenders: string[] = [];
    if (overflowX) {
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width <= clientWidth + 2) continue;
        if (rect.right <= clientWidth + 8) continue;
        const tag = el.tagName.toLowerCase();
        const cls = typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 3).join('.') : '';
        offenders.push(`${tag}${cls ? '.' + cls : ''} w=${Math.round(rect.width)}`);
        if (offenders.length >= 8) break;
      }
    }
    return { viewport: label, overflowX, scrollWidth, clientWidth, offenders };
  }, viewport);
  overflows.push(finding);
  return finding;
}

async function socialLink(page: Page, name: string): Promise<Locator> {
  return page.locator('footer').getByRole('link', { name, exact: true });
}

function writeReport(): string {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const passed = checks.filter((c) => c.status === 'Pass').length;
  const failed = checks.filter((c) => c.status === 'Fail').length;
  const warned = checks.filter((c) => c.status === 'Warn').length;
  const generatedAt = new Date().toISOString();

  const lines: string[] = [
    '# Zafirixpro — Prospective customer journey (Playwright)',
    '',
    `- Generated: ${generatedAt}`,
    `- Checks: ${checks.length} · Pass: ${passed} · Fail: ${failed} · Warn: ${warned}`,
    '',
    '## Elements tested',
    '',
    '| Area | Element | Status | Detail |',
    '| --- | --- | --- | --- |',
    ...checks.map(
      (c) =>
        `| ${c.area} | ${c.name} | **${c.status}** | ${c.detail.replace(/\|/g, '\\|')} |`,
    ),
    '',
    '## Overflow / layout',
    '',
  ];

  if (overflows.length === 0) {
    lines.push('_No overflow measurements captured._', '');
  } else {
    for (const o of overflows) {
      const status = o.overflowX ? 'Fail' : 'Pass';
      lines.push(
        `- **${o.viewport}**: ${status} (scrollWidth ${o.scrollWidth} / clientWidth ${o.clientWidth})`,
      );
      if (o.offenders.length) {
        lines.push(`  - Offenders: ${o.offenders.join(', ')}`);
      }
    }
    lines.push('');
  }

  const broken = checks.filter(
    (c) => c.status === 'Fail' && /link|href|social|nav/i.test(`${c.area} ${c.name}`),
  );
  const missing = checks.filter((c) => c.status === 'Fail' && /missing|not found|not visible/i.test(c.detail));

  lines.push('## Broken links, overflows, missing components', '');
  if (failed === 0 && overflows.every((o) => !o.overflowX)) {
    lines.push('No critical broken links, horizontal overflows, or missing public components detected.', '');
  } else {
    for (const c of [...broken, ...missing]) {
      lines.push(`- **${c.status}** — ${c.area} / ${c.name}: ${c.detail}`);
    }
    for (const o of overflows.filter((x) => x.overflowX)) {
      lines.push(`- **Fail** — Horizontal overflow on ${o.viewport}`);
    }
    lines.push('');
  }

  const uniqueRecs = [...new Set(recommendations)];
  lines.push('## UX / UI recommendations', '');
  if (uniqueRecs.length === 0) {
    lines.push('- Keep CTA contrast (navy `#0F1F3D` + cyan `#06b6d4`) consistent from landing through signup.');
  } else {
    for (const rec of uniqueRecs) lines.push(`- ${rec}`);
  }
  lines.push('', `## ${STANDING_BY}`, '');

  const markdown = lines.join('\n');
  const mdPath = path.join(REPORT_DIR, 'customer-journey-latest.md');
  const jsonPath = path.join(REPORT_DIR, 'customer-journey-latest.json');
  fs.writeFileSync(mdPath, markdown, 'utf8');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ generatedAt, passed, failed, warned, checks, overflows, recommendations: uniqueRecs }, null, 2),
    'utf8',
  );
  return markdown;
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.describe('Prospective customer journey', () => {
  test.afterAll(() => {
    const markdown = writeReport();
    // eslint-disable-next-line no-console
    console.log(`\n${markdown}\n${STANDING_BY}\n`);
  });

  test('French landing, nav, features, footer socials, pricing, signup', async ({ page }) => {
    page.setDefaultTimeout(25_000);

    await test.step('Land on /landing/fr', async () => {
      const res = await page.goto('/landing/fr', { waitUntil: 'domcontentloaded' });
      const ok = (res?.ok() ?? false) && /\/landing\/fr/.test(page.url());
      const heading = page.getByRole('heading', { name: /ZAFIRIX/i }).first();
      await expect(heading).toBeVisible({ timeout: 20_000 });
      if (ok) {
        record('Landing FR', 'Home load', 'Pass', page.url());
      } else {
        record(
          'Landing FR',
          'Home load',
          'Fail',
          `status=${res?.status() ?? 'n/a'} url=${page.url()}`,
        );
      }
      const dir = await page.locator('div.min-h-dvh').first().getAttribute('dir');
      if (dir === 'ltr') record('Landing FR', 'LTR direction', 'Pass', 'dir=ltr');
      else record('Landing FR', 'LTR direction', 'Warn', `dir=${dir ?? 'missing'}`);
    });

    await test.step('Nav links', async () => {
      const pricingNav = page.locator('header').getByRole('link', { name: /^Tarifs$/ });
      const loginNav = page.locator('header').getByRole('link', { name: /^Connexion$/ });
      const arToggle = page.locator('header').getByRole('link', { name: 'العربية' });
      const pricingVisible = await pricingNav.isVisible();
      const loginVisible = await loginNav.isVisible();
      const toggleVisible = await arToggle.isVisible();
      record('Landing FR', 'Nav Tarifs', pricingVisible ? 'Pass' : 'Fail', pricingVisible ? 'visible' : 'missing');
      record('Landing FR', 'Nav Connexion', loginVisible ? 'Pass' : 'Fail', loginVisible ? 'visible' : 'missing');
      record('Landing FR', 'Locale toggle AR', toggleVisible ? 'Pass' : 'Fail', toggleVisible ? 'visible' : 'missing');
      await expect(pricingNav).toBeVisible();
    });

    await test.step('Scroll feature blocks', async () => {
      const modules = page.getByRole('heading', { name: 'Modules essentiels' });
      await modules.scrollIntoViewIfNeeded();
      const moduleCards = page.locator('section').filter({ has: modules }).locator('h3');
      const cardCount = await moduleCards.count();
      if (cardCount >= 4) record('Landing FR', 'Feature modules', 'Pass', `${cardCount} cards`);
      else record('Landing FR', 'Feature modules', 'Fail', `expected ≥4 cards, got ${cardCount}`);

      await page.getByRole('heading', { name: 'Des forfaits clairs' }).scrollIntoViewIfNeeded();
      await page.getByRole('heading', { name: 'Audit & Conformité Maroc' }).scrollIntoViewIfNeeded();
      const auditVisible = await page.getByRole('heading', { name: 'Audit & Conformité Maroc' }).isVisible();
      record(
        'Landing FR',
        'Audit feature block',
        auditVisible ? 'Pass' : 'Fail',
        auditVisible ? 'visible after scroll' : 'not visible',
      );

      const overflow = await measureOverflow(page, 'landing/fr desktop');
      record(
        'Layout',
        'Landing FR overflow-x',
        overflow.overflowX ? 'Fail' : 'Pass',
        overflow.overflowX
          ? `scrollWidth ${overflow.scrollWidth} > ${overflow.clientWidth}`
          : 'no horizontal overflow',
      );
    });

    await test.step('Footer social href / target', async () => {
      await page.locator('footer').scrollIntoViewIfNeeded();
      for (const social of SOCIAL_EXPECTATIONS) {
        const link = await socialLink(page, social.name);
        const visible = await link.isVisible().catch(() => false);
        if (!visible) {
          record('Footer', social.name, 'Fail', 'link not visible');
          recommendations.push(`Restore the ${social.name} footer link so prospects can reach official channels.`);
          continue;
        }
        const href = (await link.getAttribute('href')) ?? '';
        const target = (await link.getAttribute('target')) ?? '';
        const rel = (await link.getAttribute('rel')) ?? '';
        const hrefOk = href.toLowerCase().includes(social.hrefIncludes.toLowerCase());
        const targetOk = !social.requireBlank || target === '_blank';
        const relOk = !social.requireBlank || /noopener/.test(rel);
        if (hrefOk && targetOk && relOk) {
          record(
            'Footer',
            social.name,
            'Pass',
            `href=${href} target=${target || '(none)'} rel=${rel || '(none)'}`,
          );
        } else {
          record(
            'Footer',
            social.name,
            'Fail',
            `href=${href} target=${target || '(none)'} rel=${rel || '(none)'}`,
          );
        }
      }

      const linkedIn = await socialLink(page, 'LinkedIn');
      if (await linkedIn.isVisible().catch(() => false)) {
        const href = (await linkedIn.getAttribute('href')) ?? '';
        const target = (await linkedIn.getAttribute('target')) ?? '';
        if (!href || href === '#' || href.startsWith('javascript:')) {
          record('Footer', 'LinkedIn', 'Fail', `placeholder href="${href}" (not a real profile URL)`);
          recommendations.push(
            'Replace the LinkedIn footer href="#" with the official company page and add target="_blank" rel="noopener noreferrer".',
          );
        } else {
          record('Footer', 'LinkedIn', 'Pass', `href=${href} target=${target || '(none)'}`);
        }
      } else {
        record('Footer', 'LinkedIn', 'Warn', 'LinkedIn link not found');
      }

      const popupPromise = page.waitForEvent('popup', { timeout: 5_000 });
      await (await socialLink(page, 'WhatsApp')).click();
      const popup = await popupPromise.catch(() => null);
      if (popup) {
        const popupUrl = popup.url();
        record(
          'Footer',
          'WhatsApp popup',
          /wa\.me|whatsapp\.com/i.test(popupUrl) || popupUrl === 'about:blank' ? 'Pass' : 'Warn',
          popupUrl || '(navigating)',
        );
        await popup.close().catch(() => undefined);
      } else {
        record('Footer', 'WhatsApp popup', 'Warn', 'popup did not open (click still verified via href)');
      }
    });

    await test.step('Pricing via nav', async () => {
      const pricingNav = page.locator('header').getByRole('link', { name: /^Tarifs$/ });
      await pricingNav.click();
      await page.waitForURL(/\/pricing/, { timeout: 15_000 });
      const title = page.getByRole('heading', { name: /Quatre forfaits clairs/i });
      const visible = await title.isVisible().catch(() => false);
      record('Pricing', 'Open /pricing from nav', visible ? 'Pass' : 'Fail', page.url());
      await expect(title).toBeVisible();

      await page.locator('#plans').scrollIntoViewIfNeeded();
      const trialCta = page.getByRole('button', { name: /Essai 7 jours/i });
      record(
        'Pricing',
        'Trial CTA',
        (await trialCta.isVisible()) ? 'Pass' : 'Fail',
        'Essai 7 jours — sans carte',
      );
      const overflow = await measureOverflow(page, 'pricing desktop');
      record(
        'Layout',
        'Pricing overflow-x',
        overflow.overflowX ? 'Fail' : 'Pass',
        overflow.overflowX
          ? `scrollWidth ${overflow.scrollWidth} > ${overflow.clientWidth}`
          : 'no horizontal overflow',
      );
      if (overflow.overflowX) {
        recommendations.push('Tighten the pricing comparatif table on mid-width screens to avoid horizontal scroll.');
      }
    });

    await test.step('Fill signup form with test data (no live account creation)', async () => {
      await page.goto('/signup', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /Créez votre compte/i })).toBeVisible();

      await page.getByPlaceholder('Prénom et nom').fill('Fatima E2E Prospect');
      await page.getByPlaceholder('vous@entreprise.ma').fill('e2e.prospect@zafirix.test');
      await page.getByPlaceholder('8 caractères minimum').fill('Zafirix-E2E-2026!');
      await page.getByPlaceholder('Répétez le mot de passe').fill('Zafirix-E2E-2026!');

      await page.getByRole('button', { name: /Téléphone, raison sociale, ICE/i }).click();
      await page.getByPlaceholder('+212…').fill('0665425852');
      await page.getByPlaceholder(/Société de/i).fill('Atlas E2E SARL');
      await page.getByPlaceholder('Casablanca').fill('Rabat');
      await page.getByPlaceholder('001234567000012').fill('001234567000089');

      await page.locator('input[type="checkbox"]').check();

      const nameVal = await page.getByPlaceholder('Prénom et nom').inputValue();
      const emailVal = await page.getByPlaceholder('vous@entreprise.ma').inputValue();
      const filled = nameVal.includes('Fatima') && emailVal.includes('e2e.prospect');
      record(
        'Signup',
        'Fill registration form',
        filled ? 'Pass' : 'Fail',
        filled ? 'name, email, password, ICE, terms filled — submit skipped (no live account)' : 'fields did not retain values',
      );

      const createBtn = page.getByRole('button', { name: /Créer mon compte/i });
      record(
        'Signup',
        'Create account CTA',
        (await createBtn.isVisible()) && (await createBtn.isEnabled()) ? 'Pass' : 'Fail',
        'button visible and enabled after valid test data',
      );

      const overflow = await measureOverflow(page, 'signup desktop');
      record(
        'Layout',
        'Signup overflow-x',
        overflow.overflowX ? 'Fail' : 'Pass',
        overflow.overflowX
          ? `scrollWidth ${overflow.scrollWidth} > ${overflow.clientWidth}`
          : 'no horizontal overflow',
      );
    });

    recommendations.push(
      'Surface Tarifs and Connexion in the mobile header (they are currently `hidden sm:inline-flex`); the sticky bottom CTA only points to pricing.',
    );
    recommendations.push(
      'Align YouTube handle spelling (@ZafrixPro) with the Zafirixpro brand if the official channel name can be updated.',
    );
  });

  test('Arabic landing RTL + mobile overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const res = await page.goto('/landing/ar', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const heading = page.getByRole('heading', { name: /ZAFIRIX/i }).first();
    await expect(heading).toBeVisible({ timeout: 20_000 });
    const dir = await page.locator('div.min-h-dvh').first().getAttribute('dir');
    if ((res?.ok() ?? false) && dir === 'rtl') {
      record('Landing AR', 'Home load RTL', 'Pass', `${page.url()} dir=${dir}`);
    } else {
      record(
        'Landing AR',
        'Home load RTL',
        'Fail',
        `status=${res?.status() ?? 'n/a'} dir=${dir ?? 'missing'} url=${page.url()}`,
      );
    }
    expect(dir).toBe('rtl');

    await page.getByRole('heading', { name: 'الوحدات الأساسية' }).scrollIntoViewIfNeeded();
    const moduleCount = await page.locator('h3').count();
    record(
      'Landing AR',
      'Feature modules (mobile)',
      moduleCount >= 4 ? 'Pass' : 'Fail',
      `${moduleCount} h3 headings after scroll`,
    );

    const pricingCta = page.getByRole('link', { name: 'عرض الأسعار' }).first();
    record(
      'Landing AR',
      'Pricing CTA',
      (await pricingCta.isVisible()) ? 'Pass' : 'Fail',
      (await pricingCta.getAttribute('href')) ?? 'missing href',
    );

    await page.locator('footer').scrollIntoViewIfNeeded();
    const wa = await socialLink(page, 'WhatsApp');
    record(
      'Landing AR',
      'Footer WhatsApp (mobile)',
      (await wa.isVisible()) ? 'Pass' : 'Fail',
      (await wa.getAttribute('href')) ?? 'missing',
    );

    const overflow = await measureOverflow(page, 'landing/ar mobile 390px');
    record(
      'Layout',
      'Landing AR mobile overflow-x',
      overflow.overflowX ? 'Fail' : 'Pass',
      overflow.overflowX
        ? `scrollWidth ${overflow.scrollWidth} > ${overflow.clientWidth}; ${overflow.offenders.join(', ')}`
        : 'no horizontal overflow',
    );
    if (overflow.overflowX) {
      recommendations.push('Audit Arabic RTL landing at 390px width — a child wider than the viewport is causing horizontal scroll.');
    }
  });
});
