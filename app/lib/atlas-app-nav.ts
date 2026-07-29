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
  Landmark,
  Settings,
  CreditCard,
  Shield,
  Tags,
  ClipboardList,
  Sparkles,
  CircleHelp,
  Wrench,
  Wand2,
  Package,
  Truck,
  Wallet,
  Gavel,
} from 'lucide-react';

export type AtlasNavItemId =
  | 'dashboard'
  | 'companies'
  | 'cabinet'
  | 'clients'
  | 'consultant'
  | 'assistant'
  | 'smart-generator'
  | 'audit'
  | 'agents'
  | 'documents'
  | 'validation'
  | 'comptabilite'
  | 'banque'
  | 'factures'
  | 'inventaire'
  | 'logistique'
  | 'recouvrement'
  | 'caisse'
  | 'juridique'
  | 'rh'
  | 'etude'
  | 'rapports'
  | 'tva'
  | 'is'
  | 'liasse'
  | 'ir'
  | 'subscription'
  | 'billing'
  | 'pricing'
  | 'settings'
  | 'admin'
  | 'setup'
  | 'help';

export type AtlasAppNavItem = {
  id: AtlasNavItemId;
  label: string;
  labelAr: string;
  icon: LucideIcon;
  href: string;
};

/**
 * Full SaaS sidebar: same entries for every active user (plans affect quotas only).
 */
export const ATLAS_APP_NAV_ITEMS: AtlasAppNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', labelAr: 'الرئيسية', icon: LayoutDashboard, href: '/' },
  { id: 'setup', label: 'Configuration', labelAr: 'الإعداد', icon: Wrench, href: '/setup' },
  { id: 'help', label: 'Aide', labelAr: 'المساعدة', icon: CircleHelp, href: '/help' },
  { id: 'companies', label: 'Mes sociétés', labelAr: 'شركاتي', icon: Building2, href: '/companies' },
  { id: 'cabinet', label: 'Portfolio cabinet', labelAr: 'محفظة المكتب', icon: Users, href: '/cabinet' },
  { id: 'clients', label: 'Clients', labelAr: 'العملاء', icon: Users, href: '/clients' },
  { id: 'consultant', label: 'Consultant IA', labelAr: 'المستشار الذكي', icon: Brain, href: '/consultant' },
  { id: 'assistant', label: 'Assistant IA', labelAr: 'المساعد المحاسبي', icon: Sparkles, href: '/assistant' },
  { id: 'smart-generator', label: 'Smart Generator', labelAr: 'المولّد الذكي', icon: Wand2, href: '/smart-generator' },
  { id: 'audit', label: 'Audit IA', labelAr: 'التدقيق الذكي', icon: Shield, href: '/audit' },
  { id: 'agents', label: 'Agents IA', labelAr: 'الوكلاء الذكيون', icon: Zap, href: '/agents' },
  { id: 'documents', label: 'Documents IA', labelAr: 'وثائق ذكية', icon: Upload, href: '/documents' },
  { id: 'validation', label: 'Validation', labelAr: 'التحقق', icon: ClipboardList, href: '/validation' },
  { id: 'comptabilite', label: 'Comptabilité', labelAr: 'المحاسبة', icon: LayoutDashboard, href: '/comptabilite' },
  { id: 'banque', label: 'Banque', labelAr: 'البنك', icon: Landmark, href: '/banque' },
  { id: 'factures', label: 'Factures', labelAr: 'الفواتير', icon: FileText, href: '/factures' },
  { id: 'inventaire', label: 'Inventaire', labelAr: 'المخزون', icon: Package, href: '/inventaire' },
  { id: 'logistique', label: 'Logistique & COD', labelAr: 'اللوجستيك', icon: Truck, href: '/logistique' },
  { id: 'recouvrement', label: 'Recouvrement', labelAr: 'التحصيل', icon: Gavel, href: '/recouvrement' },
  { id: 'caisse', label: 'Caisse', labelAr: 'الصندوق', icon: Wallet, href: '/caisse' },
  { id: 'juridique', label: 'Juridique', labelAr: 'القانونية', icon: Scale, href: '/juridique' },
  { id: 'rh', label: 'Ressources humaines', labelAr: 'الموارد البشرية', icon: Users, href: '/rh' },
  { id: 'etude', label: 'Étude de projet', labelAr: 'دراسة الجدوى', icon: BarChart2, href: '/etude-projet' },
  { id: 'rapports', label: 'Rapports', labelAr: 'التقارير', icon: FileText, href: '/rapports' },
  { id: 'tva', label: 'TVA', labelAr: 'الضريبة TVA', icon: Receipt, href: '/tva' },
  { id: 'is', label: 'IS Fiscal', labelAr: 'ضريبة الشركات', icon: Calculator, href: '/is' },
  { id: 'liasse', label: 'Liasse fiscale', labelAr: 'الحزمة الضريبية', icon: ClipboardList, href: '/liasse' },
  { id: 'ir', label: 'IR / Salaires', labelAr: 'الرواتب والضرائب', icon: TrendingUp, href: '/ir' },
  { id: 'billing', label: 'Facturation', labelAr: 'الفوترة', icon: CreditCard, href: '/billing' },
  { id: 'subscription', label: 'Abonnement', labelAr: 'الاشتراك', icon: CreditCard, href: '/subscription' },
  { id: 'pricing', label: 'Tarifs', labelAr: 'الأسعار', icon: Tags, href: '/pricing' },
  { id: 'settings', label: 'Paramètres', labelAr: 'الإعدادات', icon: Settings, href: '/settings' },
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
