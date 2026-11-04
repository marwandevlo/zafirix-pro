import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * Visual review: one full-page screenshot per workspace tab and sub-tab of the journey's bakery study,
 * for a human to read. Run after studio-journey.spec.ts on the same stack.
 */

const DIR = process.env.STUDIO_E2E_DIR ?? '';
const OUT = join(DIR, 'review');
type Session = { session: Record<string, unknown> };
const stack = (): Session => JSON.parse(readFileSync(join(DIR, 'session.json'), 'utf8')) as Session;
const cookieValue = (session: Record<string, unknown>) => `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'sb-127-auth-token', value: cookieValue(stack().session), url: baseURL! }]);
});

async function bakeryId(page: Page): Promise<string> {
  const s = stack().session;
  const res = await page.request.get('/api/business-studio/studies', {
    headers: { Cookie: `sb-127-auth-token=${cookieValue(s)}`, Authorization: `Bearer ${String(s.access_token)}` },
  });
  const { studies } = (await res.json()) as { studies: Array<{ id: string; name: string; kind: string }> };
  const hit = studies.find((x) => x.kind === 'v2' && x.name.startsWith('Boulangerie Atlas'));
  if (!hit) throw new Error('run studio-journey.spec.ts first');
  return hit.id;
}

/** The app scrolls inside its own container, so the viewport is grown to that container's content height. */
async function shoot(page: Page, path: string) {
  const size = page.viewportSize()!;
  const height = await page.evaluate(() => {
    let best = document.documentElement.scrollHeight;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 4 && el.clientWidth > window.innerWidth / 2) {
        best = Math.max(best, el.scrollHeight + el.getBoundingClientRect().top);
      }
    }
    return best;
  });
  await page.setViewportSize({ width: size.width, height: Math.min(Math.ceil(height) + 24, 14_000) });
  await page.waitForTimeout(400);
  await page.screenshot({ path });
  const full = page.viewportSize()!;
  for (let y = 0, k = 1; y < full.height; y += 1000, k += 1) {
    await page.screenshot({ path: path.replace(/\.png$/, `.part${k}.png`), clip: { x: 0, y, width: full.width, height: Math.min(1000, full.height - y) } });
  }
  await page.setViewportSize(size);
}

const slug = (s: string) => s.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tab';

for (const lang of ['fr', 'ar'] as const) {
  test(`review screenshots ${lang}`, async ({ page }, info) => {
    test.skip(lang === 'fr' && info.project.name === 'mobile');
    test.setTimeout(600_000);
    mkdirSync(OUT, { recursive: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // The local stack has no Auth admin API, so the app-wide welcome e-mail bootstrap answers 400 there.
    page.on('response', (r) => {
      if (r.status() >= 400 && !r.url().endsWith('/api/email/welcome')) errors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
    });
    await page.addInitScript((l) => window.localStorage.setItem('zafirix_studio_lang', l), lang);
    const id = await bakeryId(page);
    const prefix = `${info.project.name}-${lang}`;
    await page.goto('/etude-projet');
    await expect(page.locator('table').first()).toBeVisible();
    await shoot(page, join(OUT, `${prefix}-00-home.png`));
    await page.goto(`/etude-projet/${id}`);
    const top = page.getByRole('tablist').first().getByRole('tab');
    await expect(top.first()).toBeVisible();
    const shots: string[] = [];
    const n = await top.count();
    for (let i = 0; i < n; i++) {
      const name = (await top.nth(i).innerText()).trim();
      await top.nth(i).click();
      await page.waitForTimeout(600);
      const file = `${prefix}-${String(i + 1).padStart(2, '0')}-${slug(name)}.png`;
      await shoot(page, join(OUT, file));
      shots.push(file);
      const lists = page.getByRole('tablist');
      if ((await lists.count()) > 1) {
        const sub = lists.nth(1).getByRole('tab');
        const k = await sub.count();
        for (let j = 1; j < k; j++) {
          const subName = (await sub.nth(j).innerText()).trim();
          await sub.nth(j).click();
          await page.waitForTimeout(500);
          const f = `${prefix}-${String(i + 1).padStart(2, '0')}-${String(j + 1).padStart(2, '0')}-${slug(subName)}.png`;
          await shoot(page, join(OUT, f));
          shots.push(f);
        }
      }
    }
    writeFileSync(join(OUT, `${prefix}-index.json`), JSON.stringify({ shots, errors }, null, 2));
    expect(errors).toEqual([]);
  });
}
