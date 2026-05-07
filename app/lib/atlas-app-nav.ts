import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Calculator,
  TrendingUp,
  Upload,
  Brain,
  Zap,
  BarChart2,
  Scale,
  Users,
  Building2,
  Settings,
  CreditCard,
  Shield,
} from 'lucide-react';

export type AtlasNavItemId =
  | 'dashboard'
  | 'tva'
  | 'is'
  | 'ir'
  | 'factures'
  | 'clients'
  | 'comptabilite'
  | 'documents'
  | 'consultant'
  | 'agents'
  | 'etude'
  | 'juridique'
  | 'rh'
  | 'companies'
  | 'rapports'
  | 'settings'
  | 'subscription'
  | 'admin';

export type AtlasAppNavItem = {
  id: AtlasNavItemId;
  label: string;
  labelAr: string;
  icon: LucideIcon;
  href: string;
};

/** Master order — filter by context, never reorder ad hoc. */
export const ATLAS_APP_NAV_ITEMS: AtlasAppNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', labelAr: 'الرئيسية', icon: LayoutDashboard, href: '/' },
  { id: 'tva', label: 'TVA', labelAr: 'الضريبة TVA', icon: Receipt, href: '/tva' },
  { id: 'is', label: 'IS Fiscal', labelAr: 'ضريبة الشركات', icon: Calculator, href: '/is' },
  { id: 'ir', label: 'IR / Salaires', labelAr: 'الرواتب والضرائب', icon: TrendingUp, href: '/ir' },
  { id: 'factures', label: 'Factures', labelAr: 'الفواتير', icon: FileText, href: '/factures' },
  { id: 'clients', label: 'Clients', labelAr: 'العملاء', icon: Users, href: '/clients' },
  { id: 'comptabilite', label: 'Comptabilité', labelAr: 'المحاسبة', icon: LayoutDashboard, href: '/comptabilite' },
  { id: 'documents', label: 'Documents IA', labelAr: 'وثائق ذكية', icon: Upload, href: '/documents' },
  { id: 'consultant', label: 'Consultant IA', labelAr: 'المستشار', icon: Brain, href: '/consultant' },
  { id: 'agents', label: 'Agents IA', labelAr: 'الوكلاء الذكيون', icon: Zap, href: '/agents' },
  { id: 'etude', label: 'Étude de projet', labelAr: 'دراسة الجدوى', icon: BarChart2, href: '/etude-projet' },
  { id: 'juridique', label: 'Juridique', labelAr: 'القانونية', icon: Scale, href: '/juridique' },
  { id: 'rh', label: 'Ressources humaines', labelAr: 'الموارد البشرية', icon: Users, href: '/rh' },
  { id: 'companies', label: 'Mes sociétés', labelAr: 'شركاتي', icon: Building2, href: '/companies' },
  { id: 'rapports', label: 'Rapports PDF', labelAr: 'التقارير', icon: FileText, href: '/rapports' },
  { id: 'settings', label: 'Paramètres', labelAr: 'الإعدادات', icon: Settings, href: '/settings' },
  { id: 'subscription', label: 'Abonnement', labelAr: 'الاشتراك', icon: CreditCard, href: '/subscription' },
  { id: 'admin', label: 'Administration', labelAr: 'الإدارة', icon: Shield, href: '/admin' },
];

/** Full module list for the sidebar on every app route (single source of truth: `ATLAS_APP_NAV_ITEMS` order). */
const ALL_ATLAS_NAV_IDS: AtlasNavItemId[] = ATLAS_APP_NAV_ITEMS.map((item) => item.id);

export function getVisibleAtlasNavIds(pathname: string): AtlasNavItemId[] {
  void pathname;
  return ALL_ATLAS_NAV_IDS;
}

export function filterAtlasNavItemsForPath(pathname: string): AtlasAppNavItem[] {
  const allowed = new Set(getVisibleAtlasNavIds(pathname));
  return ATLAS_APP_NAV_ITEMS.filter((item) => allowed.has(item.id));
}

export function resolveActiveAtlasNavId(pathname: string, visible: AtlasAppNavItem[]): AtlasNavItemId {
  const p = pathname || '/';
  let best: { id: AtlasNavItemId; len: number } | null = null;
  for (const item of visible) {
    if (item.href === '/') {
      if (p === '/' || p === '') {
        if (!best || best.len < 1) best = { id: 'dashboard', len: 1 };
      }
      continue;
    }
    if (p === item.href || p.startsWith(`${item.href}/`)) {
      const len = item.href.length;
      if (!best || len > best.len) best = { id: item.id, len };
    }
  }
  if (best) return best.id;
  return visible[0]?.id ?? 'dashboard';
}
