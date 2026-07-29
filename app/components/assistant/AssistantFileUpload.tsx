'use client';

import { useCallback, useRef, useState } from 'react';
import { FileUp, Loader2, Paperclip, X } from 'lucide-react';

const ACCEPT = '.pdf,.csv,.xlsx,.xls,.txt,.png,.jpg,.jpeg,.webp,.gif';

type AssistantFileUploadProps = {
  disabled?: boolean;
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
};

export function AssistantFileUpload({ disabled, onFileSelect, selectedFile }: AssistantFileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pickFile = useCallback((file: File | null) => {
    if (!file) {
      onFileSelect(null);
      return;
    }
    const ok = /\.(pdf|csv|xlsx?|txt|png|jpe?g|webp|gif)$/i.test(file.name);
    if (!ok) return;
    onFileSelect(file);
  }, [onFileSelect]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) pickFile(file);
  }, [disabled, pickFile]);

  return (
    <div className="space-y-2">
      {selectedFile ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-xl text-sm">
          <Paperclip size={14} className="text-violet-600 shrink-0" />
          <span className="truncate flex-1 text-violet-900">{selectedFile.name}</span>
          <button
            type="button"
            onClick={() => onFileSelect(null)}
            className="text-violet-400 hover:text-violet-700"
            aria-label="Retirer le fichier"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`flex items-center justify-center gap-2 px-3 py-2 border border-dashed rounded-xl text-xs cursor-pointer transition-colors ${
            dragOver ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-500 hover:border-violet-300 hover:bg-violet-50/50'
          } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <FileUp size={14} />
          Glisser-déposer PDF, Excel, CSV ou image — ou cliquer
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

type AssistantFileUploadButtonProps = {
  loading?: boolean;
};

export function AssistantFileUploadSpinner({ loading }: AssistantFileUploadButtonProps) {
  if (!loading) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-violet-600">
      <Loader2 size={12} className="animate-spin" /> Analyse du fichier…
    </span>
  );
}
