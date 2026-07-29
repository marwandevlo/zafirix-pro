import type { Page, Response } from '@playwright/test';

/** Benign console messages to ignore during audits. */
const CONSOLE_IGNORE = [
  /favicon/i,
  /Failed to load resource.*404/i,
  /Download the React DevTools/i,
  /hydration/i,
];

/** API paths that may legitimately return 401/403 in local/demo mode. */
const ALLOWED_FAILED_API = [
  /\/api\/inventory/,
  /\/api\/logistics/,
  /\/api\/debt-collection/,
  /\/api\/petty-cash/,
  /\/api\/notifications/,
  /\/api\/auditor/,
  /\/api\/factures/,
  /\/api\/documents/,
];

export type PageAudit = {
  consoleErrors: string[];
  failedResponses: { url: string; status: number }[];
  wasRedirectedToAuth: boolean;
};

/** Attach listeners to collect runtime errors before navigation. */
export function attachPageAudit(page: Page): PageAudit {
  const audit: PageAudit = {
    consoleErrors: [],
    failedResponses: [],
    wasRedirectedToAuth: false,
  };

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (CONSOLE_IGNORE.some((re) => re.test(text))) return;
    audit.consoleErrors.push(text);
  });

  page.on('pageerror', (err) => {
    audit.consoleErrors.push(err.message);
  });

  page.on('response', (response: Response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    if (status === 401 || status === 403) {
      if (ALLOWED_FAILED_API.some((re) => re.test(url))) return;
    }
    audit.failedResponses.push({ url, status });
  });

  return audit;
}

/** Returns true if the app redirected away from the module (auth gate). */
export async function detectAuthRedirect(page: Page): Promise<boolean> {
  const url = page.url();
  return /\/(landing|login)(\?|$)/.test(url);
}

/** Assert the page rendered without a Next.js error overlay or fatal crash. */
export async function assertHealthyPage(
  page: Page,
  audit: PageAudit,
  opts?: { allowAuthRedirect?: boolean },
): Promise<void> {
  if (await detectAuthRedirect(page)) {
    audit.wasRedirectedToAuth = true;
    if (!opts?.allowAuthRedirect) {
      throw new Error(`Unexpected auth redirect: ${page.url()}`);
    }
    return;
  }

  const nextError = page.locator('[data-nextjs-dialog], #nextjs__container_errors_label');
  const errorCount = await nextError.count();
  if (errorCount > 0) {
    const text = await nextError.first().textContent().catch(() => '');
    throw new Error(`Next.js error overlay detected: ${text}`);
  }

  const criticalFailures = audit.failedResponses.filter(
    (r) => r.status >= 500 && !r.url.includes('/api/'),
  );
  if (criticalFailures.length > 0) {
    throw new Error(
      `Server errors: ${criticalFailures.map((f) => `${f.status} ${f.url}`).join(', ')}`,
    );
  }

  if (audit.consoleErrors.length > 0) {
    throw new Error(`Console errors: ${audit.consoleErrors.join(' | ')}`);
  }
}
