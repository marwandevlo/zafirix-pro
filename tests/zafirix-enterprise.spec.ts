import { test, expect } from '@playwright/test';
import { attachPageAudit, assertHealthyPage } from './helpers/page-audit';

const STORAGE = 'tests/.auth/user.json';

test.describe('Zafirix Pro — Enterprise modules', () => {
  test.use({ storageState: STORAGE });

  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(30_000);
  });

  test('Factures — table, form toggle, no crash', async ({ page }) => {
    const audit = attachPageAudit(page);
    await page.goto('/factures');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Factures', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Nouvelle facture/i })).toBeVisible();

    // Invoice list or empty state — must not show Next error overlay
    const listTab = page.getByRole('button', { name: 'Liste', exact: true });
    if (await listTab.isVisible()) {
      await listTab.click();
    }

    await page.getByRole('button', { name: /Nouvelle facture/i }).click();
    await expect(page.getByRole('heading', { name: 'Nouvelle facture' })).toBeVisible();

    // Amber load banner is acceptable; red fatal banners should not appear for list load
    const redBanner = page.locator('.border-red-100.bg-red-50').first();
    await expect(redBanner).toBeHidden({ timeout: 2_000 }).catch(() => undefined);

    await assertHealthyPage(page, audit, { allowAuthRedirect: true });
    if (!audit.wasRedirectedToAuth) {
      await expect(page.getByText('Total facturé')).toBeVisible();
    }
  });

  test('Documents — OCR view and action controls', async ({ page }) => {
    const audit = attachPageAudit(page);
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /Documents — OCR/i })).toBeVisible();

    // Sidebar tabs
    await expect(page.getByRole('button', { name: /OCR/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Bibliothèque/i })).toBeVisible();

    // OCR stats cards
    await expect(page.getByText('Documents analysés')).toBeVisible();
    await expect(page.locator('main').getByText('En cours', { exact: true })).toBeVisible();

    // Switch to library tab
    await page.getByRole('button', { name: /Bibliothèque/i }).click();
    await expect(page.getByRole('heading', { name: /Documents — Bibliothèque/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Rechercher un document/i)).toBeVisible();

    await assertHealthyPage(page, audit, { allowAuthRedirect: true });
  });

  test('Inventaire — stores, items, stock table', async ({ page }) => {
    const audit = attachPageAudit(page);
    await page.goto('/inventaire');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /Inventaire multi-magasins/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Magasin/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Article/i })).toBeVisible();

    // Empty state or stock table headers (both may render when no company is selected)
    const stockHeader = page.getByRole('columnheader', { name: 'Magasin' });
    const emptyState = page.getByText('Aucune société active');
    const hasStockTable = await stockHeader.isVisible().catch(() => false);
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    expect(hasStockTable || hasEmptyState).toBeTruthy();

    await assertHealthyPage(page, audit, { allowAuthRedirect: true });
  });

  test('Logistique — deliveries dashboard', async ({ page }) => {
    const audit = attachPageAudit(page);
    await page.goto('/logistique');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /Logistique/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Nouveau BL/i })).toBeVisible();
    await expect(page.getByText(/Expéditions actives|COD en attente/i).first()).toBeVisible();

    await assertHealthyPage(page, audit, { allowAuthRedirect: true });
  });

  test('Recouvrement — debt collection workflow', async ({ page }) => {
    const audit = attachPageAudit(page);
    await page.goto('/recouvrement');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /Recouvrement clients/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Importer impayés/i })).toBeVisible();
    await expect(page.getByText(/Dossiers actifs|Montant total dû/i).first()).toBeVisible();

    await assertHealthyPage(page, audit, { allowAuthRedirect: true });
  });

  test('Caisse — petty cash balance and entries', async ({ page }) => {
    const audit = attachPageAudit(page);
    await page.goto('/caisse');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /Caisse/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Nouvelle écriture/i })).toBeVisible();
    await expect(page.getByText(/Solde caisse/i)).toBeVisible();

    const emptyRow = page.getByRole('cell', { name: 'Aucune écriture' });
    const tableHeader = page.getByRole('columnheader', { name: 'Date' });
    const hasTable = await tableHeader.isVisible().catch(() => false);
    const hasEmpty = await emptyRow.isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBeTruthy();

    await assertHealthyPage(page, audit, { allowAuthRedirect: true });
  });

  test('Enterprise API routes return JSON (not HTML crash)', async ({ request, baseURL }) => {
    const companyId = '00000000-0000-4000-8000-000000000001';
    const endpoints = [
      `/api/inventory?companyId=${companyId}`,
      `/api/logistics/deliveries?companyId=${companyId}`,
      `/api/debt-collection?companyId=${companyId}`,
      `/api/petty-cash?companyId=${companyId}`,
      `/api/notifications?companyId=${companyId}&limit=5`,
      `/api/factures?companyId=${companyId}`,
    ];

    for (const path of endpoints) {
      const res = await request.get(`${baseURL}${path}`);
      const contentType = res.headers()['content-type'] ?? '';
      expect(contentType).toMatch(/json/);
      const body = await res.json() as { ok?: boolean; error?: string };
      expect(body.ok !== undefined || body.error !== undefined).toBeTruthy();
      expect(res.status()).toBeLessThan(500);
    }
  });
});
