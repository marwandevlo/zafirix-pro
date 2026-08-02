'use client';

import { memo } from 'react';
import type { AtlasDocument } from '@/app/types/atlas-document';
import { EmptyStateCta } from '@/app/components/ui/EmptyStateCta';

type DocumentsLibrarySidebarProps = {
  documents: AtlasDocument[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAddDocument: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  total?: number;
  onLoadMore?: () => void;
};

function DocumentsLibrarySidebarInner({
  documents,
  selectedId,
  onSelect,
  onAddDocument,
  hasMore,
  loadingMore,
  total,
  onLoadMore,
}: DocumentsLibrarySidebarProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="divide-y divide-gray-100">
        {documents.map((d) => (
          <button
            key={String(d.id)}
            type="button"
            onClick={() => onSelect(String(d.id))}
            className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${String(d.id) === String(selectedId) ? 'bg-rose-50' : ''}`}
          >
            <p className="text-sm font-medium text-gray-800 truncate">{d.title}</p>
            <p className="text-xs text-gray-400 truncate">
              {d.type} · {new Date(d.createdAt).toLocaleString('fr-FR')}
            </p>
          </button>
        ))}
        {documents.length === 0 && (
          <div className="p-4">
            <EmptyStateCta
              lang="fr"
              title="Aucun document"
              description="Importez un PDF ou une image depuis l’onglet OCR pour alimenter votre bibliothèque."
              primaryLabelFr="Ajouter maintenant"
              primaryLabelAr="ابدأ الآن"
              onPrimary={onAddDocument}
            />
          </div>
        )}
      </div>
      {(hasMore || (total != null && documents.length > 0)) && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-400">
            {total != null ? `${documents.length} / ${total}` : `${documents.length} document(s)`}
          </span>
          {hasMore && onLoadMore && (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
            >
              {loadingMore ? 'Chargement…' : 'Charger plus'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export const DocumentsLibrarySidebar = memo(DocumentsLibrarySidebarInner);
