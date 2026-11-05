import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

const DIR = process.env.STUDIO_E2E_DIR ?? '';
const OUT = join(DIR, 'downloads');
const AXE = join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

type Session = { session: Record<string, unknown>; userId: string; companyId: string; otherUserToken: string };
const stack = (): Session => JSON.parse(readFileSync(join(DIR, 'session.json'), 'utf8')) as Session;
const cookieValue = (session: Record<string, unknown>) => `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
/** Same credentials the browser sends: the session cookie (checked by the proxy) and the bearer token. */
const authHeaders = (session: Record<string, unknown>) => ({ Cookie: `sb-127-auth-token=${cookieValue(session)}`, Authorization: `Bearer ${String(session.access_token)}` });

const evidence: Record<string, unknown> = {};
const record = (key: string, value: unknown) => {
  evidence[key] = value;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `evidence-${test.info().project.name}.json`), JSON.stringify(evidence, null, 2));
};

test.beforeAll(() => {
  if (!DIR) throw new Error('STUDIO_E2E_DIR is required (folder written by serve-stack.mjs)');
  mkdirSync(OUT, { recursive: true });
});

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'sb-127-auth-token', value: cookieValue(stack().session), url: baseURL! }]);
});

const setLang = async (page: Page, lang: 'fr' | 'ar') => {
  await page.addInitScript((l) => window.localStorage.setItem('zafirix_studio_lang', l), lang);
};

const card = (page: Page, title: string | RegExp) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: typeof title === 'string' }) });
const items = (c: Locator) => c.locator(':scope > div.p-4 > div.space-y-3 > div');
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const savedState = (page: Page, text = 'Enregistré') => page.locator('span[role="status"]').filter({ hasText: new RegExp(`^${text}( ·|$)`) });

async function waitSaved(page: Page) {
  await expect(savedState(page)).toBeVisible({ timeout: 30_000 });
}

async function addItem(page: Page, title: string): Promise<Locator> {
  const c = card(page, title);
  const before = await items(c).count();
  await c.getByRole('button', { name: /Ajouter|إضافة/ }).click();
  await expect(items(c)).toHaveCount(before + 1);
  return items(c).nth(before);
}

async function fill(scope: Locator, label: string, value: string) {
  const input = scope.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.blur();
}

async function download(page: Page, cardTitle: string, button: string, name: string) {
  const c = card(page, cardTitle);
  const started = Date.now();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), c.getByRole('button', { name: button, exact: true }).click()]);
  const file = join(OUT, `${name}-${dl.suggestedFilename()}`);
  await dl.saveAs(file);
  expect(await dl.failure()).toBeNull();
  return { file, suggested: dl.suggestedFilename(), ms: Date.now() - started };
}

async function axe(page: Page, label: string) {
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: Array<{ id: string; impact: string; help: string; nodes: Array<{ target: string[]; html: string }> }> }> } };
    const r = await w.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, targets: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')} :: ${n.html.slice(0, 160)}`) }));
  });
  record(`axe:${label}`, res);
  return res;
}

const blocking = (v: Array<{ impact: string }>) => v.filter((x) => x.impact === 'critical' || x.impact === 'serious');

async function createStudy(page: Page, name: string, sector: string, years: number) {
  await page.goto('/etude-projet');
  await expect(page.getByRole('heading', { name: /Business Studio|استوديو الأعمال/ })).toBeVisible();
  await page.getByRole('button', { name: /^(Nouvelle étude|دراسة جديدة)$/ }).click();
  const wizard = card(page, /^(Nouvelle étude|دراسة جديدة)$/);
  await wizard.getByRole('textbox').first().fill(name);
  await wizard.locator('select').first().selectOption(sector);
  const horizon = wizard.getByLabel(/^(Horizon \(ans\)|الأفق الزمني \(سنوات\))$/);
  await horizon.fill(String(years));
  await horizon.blur();
  await wizard.getByRole('button', { name: /^(Créer l’étude|إنشاء الدراسة)$/ }).click();
  await page.waitForURL(/\/etude-projet\/[0-9a-f-]{36}$/);
  await expect(tab(page, 'Tableau de bord').or(tab(page, 'لوحة القيادة'))).toBeVisible();
  return page.url().split('/').pop()!;
}

/** Realistic bakery-café in Rabat; amounts are inputs typed by the customer, not market statistics. */
async function fillBakery(page: Page) {
  await tab(page, 'Profil').click();
  await fill(page.locator('main, body').first(), 'Raison sociale / nom du projet', 'Boulangerie Atlas SARL');
  await fill(page.locator('body'), 'Ville', 'Rabat');
  await fill(page.locator('body'), 'Activité', 'Boulangerie-pâtisserie et salon de thé');

  await tab(page, 'Hypothèses').click();
  await tab(page, 'Produits et revenus').click();
  const prods = items(card(page, 'Produits et revenus'));
  const p1 = (await prods.count()) > 0 ? prods.first() : await addItem(page, 'Produits et revenus');
  await fill(p1, 'Nom', 'Pain et viennoiseries');
  await fill(p1, 'Prix unitaire HT', '12');
  await fill(p1, 'Volume du 1er mois', '9000');
  await fill(p1, 'Coût unitaire HT', '4.5');
  const p2 = await addItem(page, 'Produits et revenus');
  await fill(p2, 'Nom', 'Pâtisserie');
  await fill(p2, 'Prix unitaire HT', '25');
  await fill(p2, 'Volume du 1er mois', '2500');
  await fill(p2, 'Coût unitaire HT', '9');

  await tab(page, 'Charges').click();
  const e1 = await addItem(page, 'Charges');
  await fill(e1, 'Nom', 'Loyer du local');
  await fill(e1, 'Montant mensuel HT', '9000');
  const e2 = await addItem(page, 'Charges');
  await fill(e2, 'Nom', 'Électricité et gaz');
  await fill(e2, 'Montant mensuel HT', '6500');

  await tab(page, 'Personnel').click();
  const s1 = await addItem(page, 'Personnel');
  await fill(s1, 'Poste', 'Boulanger');
  await fill(s1, 'Effectif', '3');
  await fill(s1, 'Salaire brut mensuel', '5200');
  const s2 = await addItem(page, 'Personnel');
  await fill(s2, 'Poste', 'Vendeuse');
  await fill(s2, 'Effectif', '2');
  await fill(s2, 'Salaire brut mensuel', '3800');

  await tab(page, 'Investissements').click();
  const i1 = await addItem(page, 'Investissements');
  await fill(i1, 'Nom', 'Four et matériel de production');
  await fill(i1, 'Montant HT', '480000');
  await fill(i1, 'Durée d’amortissement (ans)', '10');
  const i2 = await addItem(page, 'Investissements');
  await fill(i2, 'Nom', 'Aménagement du local');
  await fill(i2, 'Montant HT', '220000');
  await fill(i2, 'Durée d’amortissement (ans)', '10');

  await tab(page, 'Financement').click();
  const eq = await addItem(page, 'Apports en capital');
  await fill(eq, 'Nom', 'Apport des associés');
  await fill(eq, 'Montant', '350000');
  const loan = await addItem(page, 'Emprunts bancaires et comptes courants d’associés');
  await fill(loan, 'Nom', 'Crédit d’investissement');
  await fill(loan, 'Principal', '500000');
  await fill(loan, 'Taux annuel', '6.5');
  await fill(loan, 'Durée (mois)', '84');
  await waitSaved(page);
}

test.describe.configure({ mode: 'serial' });

test('desktop FR: create, fill, save, reopen, analyse, generate and download', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await setLang(page, 'fr');
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const id = await createStudy(page, 'Boulangerie Atlas — étude E2E', 'retail', 7);
  record('studyId', id);
  await fillBakery(page);

  await page.reload();
  await tab(page, 'Hypothèses').click();
  await tab(page, 'Investissements').click();
  const inv = items(card(page, 'Investissements'));
  const n = await inv.count();
  await expect(inv.nth(n - 2).getByLabel('Nom', { exact: true })).toHaveValue('Four et matériel de production');
  await expect(inv.nth(n - 2).getByLabel('Montant HT', { exact: true })).toHaveValue('480000');
  await expect(inv.nth(n - 1).getByLabel('Montant HT', { exact: true })).toHaveValue('220000');
  await tab(page, 'Financement').click();
  await expect(items(card(page, 'Emprunts bancaires et comptes courants d’associés')).first().getByLabel('Principal', { exact: true })).toHaveValue('500000');
  await tab(page, 'Profil').click();
  await expect(page.getByLabel('Raison sociale / nom du projet', { exact: true })).toHaveValue('Boulangerie Atlas SARL');
  record('reopen', 'investments, loan and profile persisted after reload');

  await tab(page, 'Tableau de bord').click();
  await expect(page.getByText('Contrôles de cohérence en échec')).toHaveCount(0);
  await expect(page.locator('canvas').first()).toBeVisible();
  record('dashboardCanvases', await page.locator('canvas').count());
  await page.screenshot({ path: join(OUT, 'desktop-fr-dashboard.png'), fullPage: true });

  for (const t of ['États financiers', 'Fiscalité', 'Simulateur', 'Scénarios et sensibilité', 'Risques et analyse']) {
    await tab(page, t).click();
    await expect(page.getByRole('tabpanel').or(page.locator('main')).first()).toBeVisible();
    await expect(page.getByText('Contrôles de cohérence en échec')).toHaveCount(0);
  }
  await tab(page, 'États financiers').click();
  await expect(page.locator('table').first()).toBeVisible();
  await page.screenshot({ path: join(OUT, 'desktop-fr-statements.png'), fullPage: true });

  await expect(page.getByRole('heading', { name: 'Rapports et téléchargements' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Générer et télécharger/ })).toBeVisible();
  await tab(page, 'Rapports').click();
  const full = 'Étude de projet complète';
  const files: Record<string, Awaited<ReturnType<typeof download>>> = {
    fullPdfFr: await download(page, full, 'Télécharger PDF', 'desktop'),
    fullXlsxFr: await download(page, full, 'Télécharger Excel (.xlsx)', 'desktop'),
    fullDocxFr: await download(page, full, 'Télécharger Word (.docx)', 'desktop'),
  };
  await page.getByRole('group', { name: 'Langue / اللغة' }).getByRole('button', { name: 'العربية', exact: true }).click();
  files.fullPdfAr = await download(page, 'دراسة المشروع الكاملة', 'تنزيل PDF', 'desktop');
  files.fullXlsxAr = await download(page, 'دراسة المشروع الكاملة', 'تنزيل Excel (.xlsx)', 'desktop');
  await page.getByRole('group', { name: 'Langue / اللغة' }).getByRole('button', { name: 'FR', exact: true }).click();
  files.bankPdfFr = await download(page, 'Dossier de financement bancaire', 'Télécharger PDF', 'desktop');
  record('downloads', files);

  await card(page, full).getByRole('button', { name: 'Prévisualiser le rapport', exact: true }).click();
  const frame = page.locator('iframe[title]');
  await expect(frame).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole('link', { name: 'Ouvrir dans un nouvel onglet' })).toBeVisible();
  await page.screenshot({ path: join(OUT, 'desktop-fr-preview.png') });
  record('preview', 'iframe preview rendered');

  await page.getByRole('button', { name: 'Soumettre en revue', exact: true }).click();
  await page.getByRole('button', { name: 'Approuver (auto-validation)', exact: true }).click();
  await expect(page.getByText(/auto-validation, non indépendante/).first()).toBeVisible();
  record('approval', 'owner approval labelled as self-approval');

  expect(pageErrors).toEqual([]);
});

test('desktop FR: every horizon recomputes and saves', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await setLang(page, 'fr');
  const id = (evidence.studyId as string | undefined) ?? (await createStudy(page, 'Horizons', 'services', 5));
  await page.goto(`/etude-projet/${id}`);
  const status = page.getByText(/^(Approuvée|Brouillon|En revue)/).first();
  await expect(status).toBeVisible();
  if (await page.getByRole('button', { name: 'Rouvrir en brouillon', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Rouvrir en brouillon', exact: true }).click();
  }
  await tab(page, 'Hypothèses').click();
  const seen: Record<number, string> = {};
  for (const y of [3, 5, 7, 10, 15, 20, 30]) {
    await page.getByRole('button', { name: `${y} ans`, exact: true }).click();
    await expect(page.getByRole('button', { name: `${y} ans`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await waitSaved(page);
    await tab(page, 'États financiers').click();
    await expect(page.getByText('Contrôles de cohérence en échec')).toHaveCount(0);
    const header = await page.locator('table').first().locator('thead').innerText();
    seen[y] = header.replace(/\s+/g, ' ').slice(0, 300);
    await tab(page, 'Hypothèses').click();
  }
  record('horizons', seen);
  await tab(page, 'Rapports').click();
  record('downloads30y', {
    pdfFr: await download(page, 'Étude de projet complète', 'Télécharger PDF', 'h30'),
    xlsxFr: await download(page, 'Étude de projet complète', 'Télécharger Excel (.xlsx)', 'h30'),
    docxFr: await download(page, 'Étude de projet complète', 'Télécharger Word (.docx)', 'h30'),
  });
  await page.getByRole('group', { name: 'Langue / اللغة' }).getByRole('button', { name: 'العربية', exact: true }).click();
  record('downloads30yAr', { pdfAr: await download(page, 'دراسة المشروع الكاملة', 'تنزيل PDF', 'h30') });
  await page.getByRole('group', { name: 'Langue / اللغة' }).getByRole('button', { name: 'FR', exact: true }).click();
  await tab(page, 'Hypothèses').click();
  await page.getByRole('button', { name: '7 ans', exact: true }).click();
  await waitSaved(page);
});

test('desktop FR: compare two independent studies', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await setLang(page, 'fr');
  const other = await createStudy(page, 'Atelier de menuiserie — étude E2E', 'manufacturing', 5);
  await tab(page, 'Hypothèses').click();
  await tab(page, 'Produits et revenus').click();
  const prods = items(card(page, 'Produits et revenus'));
  const p1 = (await prods.count()) > 0 ? prods.first() : await addItem(page, 'Produits et revenus');
  await fill(p1, 'Prix unitaire HT', '1800');
  await fill(p1, 'Volume du 1er mois', '60');
  await fill(p1, 'Coût unitaire HT', '900');
  await tab(page, 'Investissements').click();
  const i1 = await addItem(page, 'Investissements');
  await fill(i1, 'Montant HT', '300000');
  await tab(page, 'Financement').click();
  const eq = await addItem(page, 'Apports en capital');
  await fill(eq, 'Montant', '400000');
  await waitSaved(page);

  const first = evidence.studyId as string;
  await page.goto(`/etude-projet/compare?a=${first}&b=${other}`);
  await expect(page.locator('table caption').first()).toBeVisible({ timeout: 60_000 });
  const rows = await page.locator('table tbody tr').count();
  expect(rows).toBeGreaterThan(10);
  await expect(page.getByText(/Horizons différents/)).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(4);
  await page.screenshot({ path: join(OUT, 'desktop-fr-compare.png'), fullPage: true });
  record('compare', { rows, a: first, b: other });
});

test('desktop: accessibility audit (axe, WCAG 2.1 A/AA) FR and AR', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  const id = evidence.studyId as string;
  const results: Record<string, number> = {};
  for (const lang of ['fr', 'ar'] as const) {
    await setLang(page, lang);
    await page.goto('/etude-projet');
    await expect(page.locator('table').first()).toBeVisible();
    const home = await axe(page, `${lang}:home`);
    results[`${lang}:home`] = blocking(home).length;
    await page.goto(`/etude-projet/${id}`);
    const tabs = page.getByRole('tablist').first().getByRole('tab');
    await expect(tabs.first()).toBeVisible();
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      const name = (await tabs.nth(i).innerText()).trim();
      await tabs.nth(i).click();
      await page.waitForTimeout(400);
      results[`${lang}:${name}`] = blocking(await axe(page, `${lang}:${name}`)).length;
    }
    await page.goto(`/etude-projet/compare?a=${id}`);
    await page.waitForTimeout(800);
    results[`${lang}:compare`] = blocking(await axe(page, `${lang}:compare`)).length;
  }
  record('axeBlockingCounts', results);
  expect(Object.values(results).every((n) => n === 0), JSON.stringify(results)).toBe(true);
});

test('mobile AR: RTL layout without overflow, reports downloadable', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await setLang(page, 'ar');
  await page.goto('/etude-projet');
  await expect(page.locator('[dir="rtl"]').first()).toBeVisible();
  const link = page.locator('table a[href^="/etude-projet/"]').first();
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL(/\/etude-projet\/[0-9a-f-]{36}$/);
  await expect(page.locator('header select').first().locator('option').first()).toHaveText('السيناريو الأساسي');
  await expect(page.getByRole('textbox', { name: 'الاسم' }).first()).toHaveAttribute('dir', 'auto');
  const overflow: Record<string, number> = {};
  const tabs = page.getByRole('tablist').first().getByRole('tab');
  await expect(tabs.first()).toBeVisible();
  const n = await tabs.count();
  for (let i = 0; i < n; i++) {
    const name = (await tabs.nth(i).innerText()).trim();
    await tabs.nth(i).click();
    await page.waitForTimeout(300);
    overflow[name] = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  }
  record('mobileOverflowPx', overflow);
  await page.screenshot({ path: join(OUT, 'mobile-ar-last-tab.png'), fullPage: true });
  expect(Object.values(overflow).every((px) => px <= 1), JSON.stringify(overflow)).toBe(true);

  await expect(page.getByRole('heading', { name: 'التقارير والتنزيلات' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'إنشاء الدراسة وتنزيلها' })).toBeVisible();
  await tab(page, 'التقارير').click();
  const full = 'دراسة المشروع الكاملة';
  record('mobileDownloads', {
    pdfAr: await download(page, full, 'تنزيل PDF', 'mobile'),
    xlsxAr: await download(page, full, 'تنزيل Excel (.xlsx)', 'mobile'),
    docxAr: await download(page, full, 'تنزيل Word (.docx)', 'mobile'),
  });
  await page.screenshot({ path: join(OUT, 'mobile-ar-reports.png'), fullPage: true });
});

test('API: another tenant cannot read, list, edit or export the study', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop');
  const own = await request.get('/api/business-studio/studies', { headers: authHeaders(stack().session) });
  expect(own.status()).toBe(200);
  const mine = (await own.json()) as { studies: Array<{ id: string; kind: string }> };
  const id = mine.studies.find((s) => s.kind === 'v2')!.id;
  const token = stack().otherUserToken;
  const sub = (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { sub: string }).sub;
  const base = stack().session;
  const other = authHeaders({ ...base, access_token: token, user: { ...(base.user as object), id: sub, email: 'other.tenant@example.test' } });
  const get = await request.get(`/api/business-studio/studies/${id}`, { headers: other });
  const list = await request.get('/api/business-studio/studies', { headers: other });
  const patch = await request.patch(`/api/business-studio/studies/${id}`, { headers: other, data: { action: 'share', sharing: 'company_edit', revision: 1 } });
  const versions = await request.get(`/api/business-studio/studies/${id}/versions`, { headers: other });
  const dup = await request.post(`/api/business-studio/studies/${id}/duplicate`, { headers: other, data: { name: 'stolen' } });
  const anon = await request.get(`/api/business-studio/studies/${id}`);
  const listed = ((await list.json()) as { studies?: Array<{ id: string }> }).studies ?? [];
  record('isolation', { otherList: list.status(), get: get.status(), patch: patch.status(), versions: versions.status(), duplicate: dup.status(), anon: anon.status(), otherListContainsStudy: listed.some((s) => s.id === id) });
  expect(list.status()).toBe(200);
  expect(get.status()).toBe(404);
  expect(versions.status()).toBe(404);
  expect(dup.status()).toBe(404);
  expect([403, 404]).toContain(patch.status());
  expect(anon.status()).toBe(401);
  expect(listed.some((s) => s.id === id)).toBe(false);
});
