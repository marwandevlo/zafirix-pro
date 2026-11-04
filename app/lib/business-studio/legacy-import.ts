/**
 * Converts a legacy `etude_faisabilite` study (chat answers) into a Business Studio model.
 * Only what the user typed is imported. Figures the old module derived from fixed assumptions
 * (average salary, social and tax rates, growth) are not carried over. Identity-document data
 * (CIN, birth date and place, personal address, nationality) is deliberately left out.
 * The legacy row itself is never modified.
 */

import {
  emptyModel, newExpense, newProduct, newStaff, type LegalForm, type SectorId, type StudyModel,
} from './model';

export type LegacyStudyRow = { id: string; name: string; metadata: Record<string, unknown> | null; createdAt?: string | null };
export type LegacyImportResult = { model: StudyModel; name: string; notes: string[] };

const PENDING = /^(en\s*cours|n\/?a|-|aucun|non|0)$/i;

export function parseLegacyNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\s\u00a0\u202f]/g, '').replace(/mad|dhs?|dh/gi, '');
  if (!s) return null;
  const normalized = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function identifier(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return !s || PENDING.test(s) ? '' : s.slice(0, 50);
}

function text(raw: unknown, max = 2000): string {
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

export function mapLegacySector(raw: string): SectorId {
  const s = raw.toLowerCase();
  if (/restaura|hôtel|hotel|café|cafe/.test(s)) return 'hospitality';
  if (/touris/.test(s)) return 'tourism';
  if (/e-?commerce|en ligne/.test(s)) return 'ecommerce';
  if (/gros|distribut/.test(s)) return 'wholesale';
  if (/commerce|boutique|magasin/.test(s)) return 'retail';
  if (/industr|fabric|usine/.test(s)) return 'manufacturing';
  if (/agri|ferme|élevage|elevage/.test(s)) return 'agriculture';
  if (/transport/.test(s)) return 'transport';
  if (/logisti/.test(s)) return 'logistics';
  if (/saas|logiciel/.test(s)) return 'saas';
  if (/immobili/.test(s)) return 'real_estate';
  if (/franchise/.test(s)) return 'franchise';
  if (/service|conseil|santé|sante|it|informatique/.test(s)) return 'services';
  return 'other';
}

export function mapLegacyLegalForm(raw: string): LegalForm {
  const s = raw.trim().toLowerCase();
  if (s === '1' || s.includes('auto')) return 'auto_entrepreneur';
  if (s === '2' || s.includes('sarl au') || s.includes('associé unique') || s.includes('associe unique')) return 'sarl_au';
  if (s === '3' || s.includes('sarl')) return 'sarl';
  if (s === '4' || /\bsa\b/.test(s)) return 'sa';
  return '';
}

export function isLegacyStudy(metadata: Record<string, unknown> | null | undefined): boolean {
  return !!metadata && metadata.kind === 'etude_faisabilite';
}

export function importLegacyStudy(row: LegacyStudyRow): LegacyImportResult {
  const meta = row.metadata ?? {};
  const w = (meta.wizardData && typeof meta.wizardData === 'object' ? meta.wizardData : {}) as Record<string, unknown>;
  const notes: string[] = [];
  const created = row.createdAt ? new Date(row.createdAt) : new Date();
  const startMonth = Number.isNaN(created.getTime())
    ? undefined
    : `${created.getUTCFullYear()}-${String(created.getUTCMonth() + 1).padStart(2, '0')}`;
  const sectorRaw = text(w.secteur, 200);
  const model = emptyModel({ startMonth, years: 5, sector: mapLegacySector(sectorRaw), projectType: 'creation' });
  notes.push('Horizon fixé à 5 ans à partir du mois de création de l’ancienne étude : à ajuster.');

  const legalForm = mapLegacyLegalForm(text(w.forme_juridique, 100));
  const c = model.profile.company;
  c.name = text(w.raison_sociale, 200) || text(w.nom_projet, 200);
  c.tradingName = text(w.nom_projet, 200);
  c.legalForm = legalForm;
  c.address = text(w.adresse_societe, 500);
  c.city = text(w.ville, 100);
  c.activity = sectorRaw;
  c.ice = identifier(w.ice);
  c.rc = identifier(w.rc);
  c.if = identifier(w.if_fiscal);
  c.cnss = identifier(w.cnss);
  c.incorporated = Boolean(c.rc || c.ice || c.if);
  model.profile.project.location = c.city;
  model.profile.project.description = text(w.description);
  const financing = text(w.financement, 200);
  if (financing) model.profile.project.objectives = `Financement recherché (réponse d’origine) : ${financing}`;

  const manager = text(w.nom_gerant, 200);
  if (manager) {
    model.profile.directors.push({ id: 'dir_import', name: manager, position: 'Gérant', history: text(w.experience), qualifications: '', experienceYears: 0 });
  }
  notes.push('Données d’identité du gérant (CIN, date et lieu de naissance, nationalité, adresse personnelle) non importées.');

  if (legalForm === 'auto_entrepreneur') {
    model.tax.regime = 'auto_entrepreneur';
    model.tax.vatSubject = false;
    notes.push('Régime auto-entrepreneur : saisissez le taux applicable à votre activité (non fixé par l’outil).');
  }

  const capital = parseLegacyNumber(w.capital);
  if (capital != null && capital > 0) model.financing.equity.push({ id: 'eq_import', name: 'Capital social', amount: capital, month: 0 });

  const revenue = parseLegacyNumber(w.ca_prevu);
  if (revenue != null && revenue > 0) {
    model.products.push(newProduct({ name: 'Chiffre d’affaires mensuel (importé)', unitPrice: revenue, volumeMonth1: 1, unitCost: 0 }));
    notes.push('Chiffre d’affaires importé comme montant mensuel hors taxes, sans croissance : précisez produits, prix, volumes et TVA.');
  }
  const rent = parseLegacyNumber(w.loyer);
  if (rent != null && rent > 0) {
    model.expenses.push(newExpense({ name: 'Loyer', category: 'rent', amountMonthly: rent, vatRatePct: 0, vatDeductible: false, indexedOnInflation: false }));
  }
  const other = parseLegacyNumber(w.charges);
  if (other != null && other > 0) {
    model.expenses.push(newExpense({ name: 'Autres charges (importées)', category: 'other', amountMonthly: other, vatRatePct: 0, vatDeductible: false, indexedOnInflation: false }));
  }
  if ((rent ?? 0) > 0 || (other ?? 0) > 0) notes.push('Charges importées sans TVA : précisez le taux et la déductibilité.');
  const employees = parseLegacyNumber(w.employes);
  if (employees != null && employees > 0) {
    model.staff.push(newStaff({ role: 'Employés (importés)', headcount: Math.round(employees), grossMonthly: 0 }));
    notes.push('Effectif importé sans salaire : l’ancien module supposait 4 500 MAD par employé ; saisissez les salaires réels.');
  }
  notes.push('Les résultats et le texte générés par l’ancien module ne sont pas repris : ils reposaient sur des taux fixes non actualisés.');

  return { model, name: text(row.name, 200) || c.tradingName || 'Étude importée', notes };
}
