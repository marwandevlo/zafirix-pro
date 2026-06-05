/**
 * Phase 17 — Isolated demo data (never mixes with real Supabase rows).
 */

import { loadOnboardingProgress, saveOnboardingProgress } from '@/app/lib/atlas-onboarding-engine';

const DEMO_FLAG = 'atlas_demo_mode_v1';
const DEMO_DATA_KEY = 'atlas_demo_workspace_data_v1';

export const DEMO_MODE_UPDATED_EVENT = 'atlas-demo-mode-updated';

export type DemoWorkspaceData = {
  invoices: Array<{ id: string; client: string; amount: number; status: string }>;
  entries: Array<{ id: string; label: string; debit: number; credit: number }>;
  tvaLines: Array<{ id: string; rate: number; base: number; tva: number }>;
  payrollRuns: Array<{ id: string; period: string; employees: number; total: number }>;
  bankTx: Array<{ id: string; date: string; label: string; amount: number }>;
  generatedAt: string;
};

function notifyDemoModeChange(active: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(DEMO_MODE_UPDATED_EVENT, { detail: { active } }));
  } catch {
    /* ignore */
  }
}

function syncOnboardingDemoFlag(active: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    const p = loadOnboardingProgress();
    saveOnboardingProgress({ ...p, demoMode: active });
  } catch {
    /* ignore */
  }
}

export function isDemoModeActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(DEMO_FLAG) === '1';
  } catch {
    return false;
  }
}

export function generateDemoWorkspace(): DemoWorkspaceData {
  const data: DemoWorkspaceData = {
    generatedAt: new Date().toISOString(),
    invoices: [
      { id: 'demo-inv-1', client: 'Client Démo SARL', amount: 12500, status: 'sent' },
      { id: 'demo-inv-2', client: 'Atlas Sample SA', amount: 8400, status: 'paid' },
    ],
    entries: [
      { id: 'demo-j-1', label: 'Vente marchandises', debit: 0, credit: 12500 },
      { id: 'demo-j-2', label: 'TVA collectée', debit: 0, credit: 2500 },
    ],
    tvaLines: [
      { id: 'demo-tva-1', rate: 20, base: 10000, tva: 2000 },
      { id: 'demo-tva-2', rate: 14, base: 5000, tva: 700 },
    ],
    payrollRuns: [{ id: 'demo-pay-1', period: '2026-05', employees: 3, total: 45000 }],
    bankTx: [
      { id: 'demo-bnk-1', date: '2026-05-01', label: 'Virement client', amount: 12500 },
      { id: 'demo-bnk-2', date: '2026-05-03', label: 'CNSS', amount: -3200 },
    ],
  };
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(DEMO_FLAG, '1');
      sessionStorage.setItem(DEMO_DATA_KEY, JSON.stringify(data));
      syncOnboardingDemoFlag(true);
      notifyDemoModeChange(true);
    } catch {
      /* ignore */
    }
  }
  return data;
}

export function loadDemoWorkspace(): DemoWorkspaceData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(DEMO_DATA_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DemoWorkspaceData;
  } catch {
    return null;
  }
}

export function exitDemoMode(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(DEMO_FLAG);
    sessionStorage.removeItem(DEMO_DATA_KEY);
    syncOnboardingDemoFlag(false);
    notifyDemoModeChange(false);
  } catch {
    /* ignore */
  }
}

/** Enable demo if off, disable if on. Returns new active state. */
export function toggleDemoMode(): boolean {
  if (isDemoModeActive()) {
    exitDemoMode();
    return false;
  }
  generateDemoWorkspace();
  return true;
}
