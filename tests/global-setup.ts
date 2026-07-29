import { chromium, type FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const STORAGE_PATH = path.join(__dirname, '.auth', 'user.json');

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://127.0.0.1:3001';
  const email = process.env.PLAYWRIGHT_TEST_EMAIL;
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD;

  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });

  if (!email || !password) {
    // Local/demo mode — no persisted session required.
    fs.writeFileSync(STORAGE_PATH, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseURL}/login`);
  await page.getByPlaceholder(/email|@/i).first().fill(email);
  await page.getByPlaceholder(/mot de passe|password/i).first().fill(password);
  await page.getByRole('button', { name: /connexion|se connecter|login/i }).click();
  await page.waitForURL(/\/(dashboard|factures|pending-approval)/, { timeout: 30_000 }).catch(() => {
    /* login may stay on login if creds invalid — tests will handle redirect */
  });
  await page.context().storageState({ path: STORAGE_PATH });
  await browser.close();
}

export default globalSetup;
