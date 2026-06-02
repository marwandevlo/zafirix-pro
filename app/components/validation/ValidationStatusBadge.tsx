'use client';

type ValidationStatus = 'draft' | 'needs_review' | 'reviewed' | 'validated' | 'rejected' | 'archived';

const STATUS_CONFIG: Record<ValidationStatus, { label: string; className: string }> = {
  draft: { label: 'Brouillon', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  needs_review: { label: 'À réviser', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  reviewed: { label: 'Révisé', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  validated: { label: 'Validé', className: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { label: 'Rejeté', className: 'bg-red-50 text-red-700 border-red-200' },
  archived: { label: 'Archivé', className: 'bg-gray-50 text-gray-500 border-gray-200' },
};

type ValidationStatusBadgeProps = {
  status: string | null | undefined;
  size?: 'sm' | 'xs';
};

export function ValidationStatusBadge({ status, size = 'sm' }: ValidationStatusBadgeProps) {
  if (!status) return null;
  const config = STATUS_CONFIG[status as ValidationStatus];
  if (!config) return null;

  return (
    <span className={`inline-flex items-center border rounded-full font-medium ${config.className} ${size === 'xs' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5'}`}>
      {config.label}
    </span>
  );
}

export { STATUS_CONFIG };
export type { ValidationStatus };
