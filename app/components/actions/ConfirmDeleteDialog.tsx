'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, Archive, Trash2, X } from 'lucide-react';
import { createPortal } from 'react-dom';

type ConfirmDeleteDialogProps = {
  open: boolean;
  entityName: string;
  entityType?: string;
  /** If true, offer "Archive" as a softer alternative. */
  showArchiveOption?: boolean;
  onConfirmDelete: () => void;
  onConfirmArchive?: () => void;
  onCancel: () => void;
  /** Custom message override. */
  message?: string;
};

export function ConfirmDeleteDialog({
  open,
  entityName,
  entityType = 'cet élément',
  showArchiveOption = true,
  onConfirmDelete,
  onConfirmArchive,
  onCancel,
  message,
}: ConfirmDeleteDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const dialog = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Fermer"
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="confirm-delete-title" className="text-base font-semibold text-gray-900">
              Supprimer {entityType} ?
            </h2>
            <p className="text-sm text-gray-500 mt-1 break-words">
              {message ?? (
                <>
                  <span className="font-medium text-gray-700">&quot;{entityName}&quot;</span>
                  {' '}sera supprimé définitivement. Cette action est irréversible.
                </>
              )}
            </p>
          </div>
        </div>

        {showArchiveOption && onConfirmArchive && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs text-amber-700 font-medium mb-2">
              Archiver plutôt que supprimer ?
            </p>
            <p className="text-xs text-amber-600">
              L'archivage masque l'élément sans le supprimer définitivement. Recommandé pour les données comptables.
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-col sm:flex-row gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors font-medium"
          >
            Annuler
          </button>

          {showArchiveOption && onConfirmArchive && (
            <button
              onClick={onConfirmArchive}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-300 text-amber-800 rounded-xl text-sm hover:bg-amber-100 transition-colors font-medium"
            >
              <Archive size={14} />
              Archiver
            </button>
          )}

          <button
            onClick={onConfirmDelete}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700 transition-colors font-medium"
          >
            <Trash2 size={14} />
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(dialog, document.body);
}
