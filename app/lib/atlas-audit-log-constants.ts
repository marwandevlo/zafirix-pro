/** Client-safe audit action types and UI labels (no server imports). */

export type AuditAction =
  | 'created'
  | 'corrected'
  | 'reviewed'
  | 'validated'
  | 'rejected'
  | 'propagated'
  | 'routed'
  | 'archived'
  | 'deleted'
  | 'restored';

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  created: 'Créé',
  corrected: 'Corrigé',
  reviewed: 'Révisé',
  validated: 'Validé',
  rejected: 'Rejeté',
  propagated: 'Correction propagée',
  routed: 'Routé vers module',
  archived: 'Archivé',
  deleted: 'Supprimé',
  restored: 'Restauré',
};

export const AUDIT_ACTION_COLORS: Record<AuditAction, string> = {
  created: 'bg-blue-50 text-blue-700 border-blue-100',
  corrected: 'bg-amber-50 text-amber-700 border-amber-100',
  reviewed: 'bg-purple-50 text-purple-700 border-purple-100',
  validated: 'bg-green-50 text-green-700 border-green-100',
  rejected: 'bg-red-50 text-red-700 border-red-100',
  propagated: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  routed: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  archived: 'bg-gray-50 text-gray-600 border-gray-200',
  deleted: 'bg-red-50 text-red-800 border-red-200',
  restored: 'bg-teal-50 text-teal-700 border-teal-100',
};
