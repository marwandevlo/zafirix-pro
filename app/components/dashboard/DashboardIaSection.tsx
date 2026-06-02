'use client';

/**
 * DashboardIaSection
 *
 * Embeds ValidationKpiCards + ValidationQueueTable on the main dashboard.
 * Also shows quick action links to the Validation Center.
 */

import { useRouter } from 'next/navigation';
import { CheckCheck, ClipboardList, ArrowRight } from 'lucide-react';
import { ValidationKpiCards } from '@/app/components/validation/ValidationKpiCards';
import { ValidationQueueTable } from '@/app/components/validation/ValidationQueueTable';

export function DashboardIaSection() {
  const router = useRouter();

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-rose-100 rounded-lg flex items-center justify-center">
            <CheckCheck size={14} className="text-rose-600" />
          </div>
          <h2 className="font-semibold text-gray-800 text-sm">Documents IA — Validation</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/validation')}
            className="flex items-center gap-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
          >
            <ClipboardList size={12} />
            File de validation
            <ArrowRight size={11} />
          </button>
          <button
            type="button"
            onClick={() => router.push('/documents')}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-700 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Documents IA
            <ArrowRight size={11} />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <ValidationKpiCards />

      {/* Queue table */}
      <ValidationQueueTable />
    </section>
  );
}
