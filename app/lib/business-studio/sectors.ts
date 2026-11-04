/**
 * Sector modules on top of the shared engine: templates (structure only, amounts left at zero for the user
 * to fill), sector inputs and sector KPIs computed from those inputs and the projection.
 */

import type { StudyResult } from './engine';
import type { StudyMetrics } from './metrics';
import {
  emptyModel, newExpense, newInvestment, newProduct, newStaff, type ExpenseCategory, type ProjectType, type SectorId, type StudyModel,
} from './model';

export type SectorInput = { id: string; label: string; unit: string };
export type SectorKpi = { id: string; label: string; unit: 'mad' | 'pct' | 'ratio' | 'count' | 'months'; formula: string; values: (number | null)[]; reason?: string };

type Template = {
  id: SectorId; label: string; labelAr: string;
  products: Array<{ name: string; kind?: 'one_time' | 'subscription'; vat?: number }>;
  expenses: Array<{ name: string; category: ExpenseCategory; variable?: boolean }>;
  staff: string[];
  investments: Array<{ name: string; kind?: 'tangible' | 'intangible' | 'land' | 'deposit'; life?: number }>;
  inputs: SectorInput[];
};

const T = (t: Template) => t;

export const SECTOR_TEMPLATES: Record<SectorId, Template> = {
  manufacturing: T({
    id: 'manufacturing', label: 'Industrie / fabrication', labelAr: 'الصناعة / التصنيع',
    products: [{ name: 'Produit fabriqué' }], expenses: [{ name: 'Énergie', category: 'utilities' }, { name: 'Maintenance', category: 'maintenance' }, { name: 'Transport sur ventes', category: 'logistics', variable: true }],
    staff: ['Directeur d’usine', 'Opérateurs', 'Contrôle qualité'], investments: [{ name: 'Machines de production', life: 10 }, { name: 'Bâtiment industriel', life: 20 }, { name: 'Terrain', kind: 'land' }],
    inputs: [{ id: 'capacityUnitsPerYear', label: 'Capacité annuelle (unités)', unit: 'unités' }],
  }),
  retail: T({
    id: 'retail', label: 'Commerce de détail', labelAr: 'تجارة التقسيط',
    products: [{ name: 'Marchandises' }], expenses: [{ name: 'Loyer du magasin', category: 'rent' }, { name: 'Électricité et eau', category: 'utilities' }, { name: 'Publicité', category: 'marketing' }],
    staff: ['Gérant', 'Vendeurs'], investments: [{ name: 'Aménagement du magasin', life: 10 }, { name: 'Caisse et informatique', kind: 'tangible', life: 5 }, { name: 'Dépôt de garantie', kind: 'deposit' }],
    inputs: [{ id: 'salesAreaM2', label: 'Surface de vente (m²)', unit: 'm²' }],
  }),
  wholesale: T({
    id: 'wholesale', label: 'Commerce de gros / distribution', labelAr: 'تجارة الجملة / التوزيع',
    products: [{ name: 'Gamme principale' }], expenses: [{ name: 'Entrepôt', category: 'rent' }, { name: 'Transport', category: 'logistics', variable: true }],
    staff: ['Directeur commercial', 'Commerciaux', 'Magasiniers'], investments: [{ name: 'Matériel de manutention', life: 5 }, { name: 'Véhicules de livraison', life: 5 }],
    inputs: [{ id: 'warehouseM2', label: 'Surface d’entrepôt (m²)', unit: 'm²' }],
  }),
  ecommerce: T({
    id: 'ecommerce', label: 'E-commerce', labelAr: 'التجارة الإلكترونية',
    products: [{ name: 'Commandes en ligne' }], expenses: [{ name: 'Marketing digital', category: 'marketing', variable: true }, { name: 'Logistique et livraison', category: 'logistics', variable: true }, { name: 'Hébergement et plateforme', category: 'it' }],
    staff: ['Responsable e-commerce', 'Service client'], investments: [{ name: 'Site et plateforme', kind: 'intangible', life: 3 }],
    inputs: [{ id: 'monthlyVisitors', label: 'Visiteurs mensuels', unit: 'visiteurs' }],
  }),
  saas: T({
    id: 'saas', label: 'SaaS / logiciel', labelAr: 'البرمجيات كخدمة',
    products: [{ name: 'Abonnement', kind: 'subscription' }], expenses: [{ name: 'Hébergement cloud', category: 'it' }, { name: 'Marketing', category: 'marketing' }],
    staff: ['Développeurs', 'Customer success', 'Commerciaux'], investments: [{ name: 'Développement de la plateforme', kind: 'intangible', life: 3 }],
    inputs: [],
  }),
  startup: T({
    id: 'startup', label: 'Startup innovante', labelAr: 'مقاولة ناشئة مبتكرة',
    products: [{ name: 'Offre principale' }], expenses: [{ name: 'Locaux / incubateur', category: 'rent' }, { name: 'Outils numériques', category: 'it' }],
    staff: ['Fondateurs', 'Équipe produit'], investments: [{ name: 'Prototype / R&D', kind: 'intangible', life: 3 }],
    inputs: [],
  }),
  services: T({
    id: 'services', label: 'Services', labelAr: 'الخدمات',
    products: [{ name: 'Prestation' }], expenses: [{ name: 'Loyer', category: 'rent' }, { name: 'Honoraires', category: 'fees' }, { name: 'Télécommunications', category: 'telecom' }],
    staff: ['Consultants'], investments: [{ name: 'Matériel informatique', life: 5 }],
    inputs: [{ id: 'billableHoursPerFte', label: 'Heures facturables par ETP et par an', unit: 'heures' }],
  }),
  agriculture: T({
    id: 'agriculture', label: 'Agriculture', labelAr: 'الفلاحة',
    products: [{ name: 'Récolte' }], expenses: [{ name: 'Semences et intrants', category: 'raw_materials', variable: true }, { name: 'Irrigation et énergie', category: 'utilities' }],
    staff: ['Exploitant', 'Ouvriers agricoles'], investments: [{ name: 'Terrain agricole', kind: 'land' }, { name: 'Matériel agricole', life: 10 }, { name: 'Système d’irrigation', life: 10 }],
    inputs: [{ id: 'hectares', label: 'Surface cultivée (ha)', unit: 'ha' }],
  }),
  real_estate: T({
    id: 'real_estate', label: 'Immobilier', labelAr: 'العقار',
    products: [{ name: 'Loyers ou ventes de lots' }], expenses: [{ name: 'Gestion et syndic', category: 'admin' }, { name: 'Entretien', category: 'maintenance' }, { name: 'Assurance', category: 'insurance' }],
    staff: ['Gestionnaire'], investments: [{ name: 'Terrain', kind: 'land' }, { name: 'Construction', life: 25 }],
    inputs: [{ id: 'lettableAreaM2', label: 'Surface louable ou vendable (m²)', unit: 'm²' }],
  }),
  hospitality: T({
    id: 'hospitality', label: 'Hôtellerie / restauration', labelAr: 'الفندقة / المطاعم',
    products: [{ name: 'Nuitées ou couverts', vat: 10 }, { name: 'Boissons et extras' }], expenses: [{ name: 'Denrées', category: 'raw_materials', variable: true }, { name: 'Énergie', category: 'utilities' }, { name: 'Blanchisserie et entretien', category: 'maintenance' }],
    staff: ['Directeur', 'Réception / salle', 'Cuisine', 'Entretien'], investments: [{ name: 'Aménagement et décoration', life: 10 }, { name: 'Équipement de cuisine', life: 7 }],
    inputs: [{ id: 'roomsOrSeats', label: 'Chambres ou places assises', unit: 'unités' }],
  }),
  tourism: T({
    id: 'tourism', label: 'Tourisme / loisirs', labelAr: 'السياحة / الترفيه',
    products: [{ name: 'Circuits et activités' }], expenses: [{ name: 'Prestataires', category: 'subcontracting', variable: true }, { name: 'Marketing', category: 'marketing' }],
    staff: ['Guides', 'Commerciaux'], investments: [{ name: 'Véhicules et équipements', life: 5 }],
    inputs: [{ id: 'visitorsPerYear', label: 'Clients par an (capacité)', unit: 'clients' }],
  }),
  transport: T({
    id: 'transport', label: 'Transport', labelAr: 'النقل',
    products: [{ name: 'Courses / trajets' }], expenses: [{ name: 'Carburant', category: 'logistics', variable: true }, { name: 'Entretien des véhicules', category: 'maintenance' }, { name: 'Assurances', category: 'insurance' }],
    staff: ['Chauffeurs', 'Exploitation'], investments: [{ name: 'Véhicules', life: 5 }],
    inputs: [{ id: 'fleetSize', label: 'Taille de la flotte', unit: 'véhicules' }],
  }),
  logistics: T({
    id: 'logistics', label: 'Logistique', labelAr: 'اللوجستيك',
    products: [{ name: 'Prestations logistiques' }], expenses: [{ name: 'Entrepôt', category: 'rent' }, { name: 'Sous-traitance transport', category: 'subcontracting', variable: true }],
    staff: ['Responsable d’exploitation', 'Préparateurs'], investments: [{ name: 'Rayonnages et manutention', life: 7 }, { name: 'Système de gestion d’entrepôt', kind: 'intangible', life: 3 }],
    inputs: [{ id: 'warehouseM2', label: 'Surface d’entrepôt (m²)', unit: 'm²' }],
  }),
  franchise: T({
    id: 'franchise', label: 'Franchise', labelAr: 'الامتياز التجاري',
    products: [{ name: 'Ventes du point de vente' }], expenses: [{ name: 'Redevance de franchise', category: 'fees', variable: true }, { name: 'Redevance publicitaire', category: 'marketing', variable: true }, { name: 'Loyer', category: 'rent' }],
    staff: ['Gérant', 'Employés'], investments: [{ name: 'Droit d’entrée', kind: 'intangible', life: 5 }, { name: 'Aménagement aux normes du réseau', life: 7 }],
    inputs: [{ id: 'outlets', label: 'Nombre de points de vente', unit: 'points de vente' }],
  }),
  other: T({
    id: 'other', label: 'Autre activité', labelAr: 'نشاط آخر',
    products: [{ name: 'Produit ou service' }], expenses: [{ name: 'Charges générales', category: 'admin' }], staff: ['Gérant'], investments: [], inputs: [],
  }),
};

/** A model pre-structured for the sector with every amount at zero. */
export function modelFromTemplate(sector: SectorId, options: { startMonth?: string; years?: number; projectType?: ProjectType } = {}): StudyModel {
  const t = SECTOR_TEMPLATES[sector];
  const m = emptyModel({ ...options, sector });
  m.products = t.products.map((p) => newProduct({ name: p.name, kind: p.kind ?? 'one_time', vatRatePct: p.vat ?? 20 }));
  m.expenses = t.expenses.map((e) => newExpense({ name: e.name, category: e.category, behavior: e.variable ? 'variable_revenue_pct' : 'fixed' }));
  m.staff = t.staff.map((role) => newStaff({ role, grossMonthly: 0 }));
  m.investments = t.investments.map((i) => newInvestment({ name: i.name, kind: i.kind ?? 'tangible', usefulLifeYears: i.life ?? 5, vatRatePct: i.kind === 'land' || i.kind === 'deposit' ? 0 : 20 }));
  for (const inp of t.inputs) m.sectorInputs[inp.id] = 0;
  return m;
}

// ─── Sector KPIs ─────────────────────────────────────────────────────────────────────────────────

export function sectorKpis(model: StudyModel, r: StudyResult, x: StudyMetrics): SectorKpi[] {
  const fys = r.calendar.fiscalYears;
  const perYear = (f: (fi: number, a: number, b: number, months: number) => number | null) => fys.map((fy) => f(fy.index, fy.firstMonth, fy.lastMonth, fy.months));
  const sumR = (s: number[], a: number, b: number) => { let t = 0; for (let m = a; m <= b; m += 1) t += s[m]; return t; };
  const volume = (a: number, b: number) => r.products.reduce((t, p) => t + sumR(p.volume, a, b), 0);
  const input = (id: string) => model.sectorInputs[id] ?? 0;
  const out: SectorKpi[] = [];
  const add = (id: string, label: string, unit: SectorKpi['unit'], formula: string, values: (number | null)[], reason?: string) => out.push({ id, label, unit, formula, values, reason });
  const needInput = (id: string, label: string) => (input(id) > 0 ? undefined : `Saisissez « ${label} » dans les données sectorielles.`);

  // Common to all sectors.
  add('revenuePerFte', 'CA par salarié', 'mad', 'CA ÷ effectif moyen', perYear((fi, a, b, n) => {
    const avg = sumR(r.monthly.headcount, a, b) / n;
    return avg > 0 ? x.years[fi].revenue / avg : null;
  }));
  add('inventoryTurnover', 'Rotation des stocks', 'ratio', 'Achats consommés ÷ stock de clôture', perYear((fi) => {
    const inv = r.monthly.inventory[fys[fi].lastMonth];
    return inv > 0 ? sumR(r.monthly.cogs, fys[fi].firstMonth, fys[fi].lastMonth) / inv : null;
  }));

  const t = SECTOR_TEMPLATES[model.sector];
  for (const inp of t.inputs) {
    const reason = needInput(inp.id, inp.label);
    const v = input(inp.id);
    switch (inp.id) {
      case 'salesAreaM2':
      case 'lettableAreaM2':
      case 'warehouseM2':
        add(`revenuePer_${inp.id}`, 'CA par m²', 'mad', `CA ÷ ${inp.label}`, perYear((fi) => (v > 0 ? x.years[fi].revenue / v : null)), reason);
        break;
      case 'hectares':
        add('revenuePerHa', 'CA par hectare', 'mad', 'CA ÷ surface cultivée', perYear((fi) => (v > 0 ? x.years[fi].revenue / v : null)), reason);
        add('yieldPerHa', 'Volume par hectare', 'count', 'Volumes vendus ÷ surface cultivée', perYear((_, a, b) => (v > 0 ? volume(a, b) / v : null)), reason);
        break;
      case 'roomsOrSeats':
        add('occupancy', 'Taux d’occupation', 'pct', 'Volumes du premier produit (nuitées ou couverts) ÷ (capacité × jours, 30 j/mois)', perYear((_, a, b, n) => (v > 0 ? (r.products[0] ? sumR(r.products[0].volume, a, b) : 0) / (v * n * 30) * 100 : null)), reason);
        add('revenuePerUnit', 'CA par chambre ou place disponible (RevPAR)', 'mad', 'CA ÷ (capacité × jours)', perYear((fi, _a, _b, n) => (v > 0 ? x.years[fi].revenue / (v * n * 30) : null)), reason);
        break;
      case 'monthlyVisitors':
        add('conversion', 'Taux de conversion', 'pct', 'Commandes ÷ visiteurs', perYear((_, a, b, n) => (v > 0 ? (volume(a, b) / (v * n)) * 100 : null)), reason);
        add('aov', 'Panier moyen', 'mad', 'CA ÷ commandes', perYear((fi, a, b) => { const q = volume(a, b); return q > 0 ? x.years[fi].revenue / q : null; }));
        break;
      case 'capacityUnitsPerYear':
        add('utilization', 'Taux d’utilisation des capacités', 'pct', 'Volumes ÷ capacité annuelle', perYear((_, a, b, n) => (v > 0 ? (volume(a, b) / (v * n / 12)) * 100 : null)), reason);
        add('unitCost', 'Coût de production unitaire', 'mad', 'Achats consommés ÷ volumes', perYear((_, a, b) => { const q = volume(a, b); return q > 0 ? sumR(r.monthly.cogs, a, b) / q : null; }));
        break;
      case 'fleetSize':
        add('revenuePerVehicle', 'CA par véhicule', 'mad', 'CA ÷ flotte', perYear((fi) => (v > 0 ? x.years[fi].revenue / v : null)), reason);
        break;
      case 'outlets':
        add('revenuePerOutlet', 'CA par point de vente', 'mad', 'CA ÷ points de vente', perYear((fi) => (v > 0 ? x.years[fi].revenue / v : null)), reason);
        break;
      case 'visitorsPerYear':
        add('fillRate', 'Taux de remplissage', 'pct', 'Clients ÷ capacité annuelle', perYear((_, a, b, n) => (v > 0 ? (volume(a, b) / (v * n / 12)) * 100 : null)), reason);
        break;
      case 'billableHoursPerFte':
        add('revenuePerBillableHour', 'CA par heure facturable', 'mad', 'CA ÷ (effectif moyen × heures facturables)', perYear((fi, a, b, n) => {
          const avg = sumR(r.monthly.headcount, a, b) / n;
          return v > 0 && avg > 0 ? x.years[fi].revenue / (avg * v * n / 12) : null;
        }), reason);
        break;
    }
  }
  if (model.sector === 'saas' || x.saas) {
    add('ruleOf40', 'Règle des 40', 'pct', 'Croissance du CA (%) + marge d’EBE (%)', x.years.map((y, i) => {
      const prev = x.years[i - 1];
      if (!prev || prev.revenue <= 0 || y.partial || prev.partial || y.ebitdaMarginPct.value == null) return null;
      return ((y.revenue - prev.revenue) / prev.revenue) * 100 + y.ebitdaMarginPct.value;
    }));
  }
  if (model.sector === 'startup' || model.sector === 'saas') {
    add('burnRate', 'Consommation mensuelle de trésorerie (burn)', 'mad', 'Moyenne des variations de trésorerie négatives hors financement', perYear((_, a, b) => {
      let s = 0; let n = 0;
      for (let m = a; m <= b; m += 1) { const f = r.monthly.cfo[m] + r.monthly.cfi[m]; if (f < 0) { s += -f; n += 1; } }
      return n > 0 ? s / n : 0;
    }));
    add('runway', 'Autonomie de trésorerie', 'months', 'Trésorerie de clôture ÷ burn mensuel', perYear((_, a, b) => {
      let s = 0; let n = 0;
      for (let m = a; m <= b; m += 1) { const f = r.monthly.cfo[m] + r.monthly.cfi[m]; if (f < 0) { s += -f; n += 1; } }
      const burn = n > 0 ? s / n : 0;
      return burn > 0 ? Math.max(0, r.monthly.cash[b]) / burn : null;
    }));
  }
  return out;
}
