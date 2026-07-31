'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import {
  subscribeAtlasToasts,
  type AtlasToastPayload,
  type AtlasToastType,
} from '@/app/lib/atlas-toast';

const ICONS: Record<AtlasToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const STYLES: Record<AtlasToastType, string> = {
  success: 'border-green-500/30 bg-gray-900',
  error: 'border-red-500/40 bg-gray-900',
  warning: 'border-amber-500/40 bg-gray-900',
  info: 'border-blue-500/30 bg-gray-900',
};

const ICON_STYLES: Record<AtlasToastType, string> = {
  success: 'text-green-400',
  error: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-blue-400',
};

export function AppToastHost() {
  const [toasts, setToasts] = useState<AtlasToastPayload[]>([]);

  useEffect(() => {
    return subscribeAtlasToasts((toast) => {
      setToasts((prev) => [...prev, toast]);
      const duration = toast.durationMs ?? 4500;
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, duration);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[400] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type];
        return (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className={`flex items-center gap-2 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg border max-w-md ${STYLES[toast.type]}`}
          >
            <Icon size={16} className={`shrink-0 ${ICON_STYLES[toast.type]}`} />
            <span>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
