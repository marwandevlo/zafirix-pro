'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { createPortal } from 'react-dom';

export type EditField = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date';
  value: string;
  required?: boolean;
  placeholder?: string;
  validate?: (value: string) => string | null;
};

type EditRecordModalProps = {
  open: boolean;
  title: string;
  fields: EditField[];
  onSave: (values: Record<string, string>) => Promise<boolean>;
  onClose: () => void;
};

export function EditRecordModal({ open, title, fields, onSave, onClose }: EditRecordModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      for (const f of fields) init[f.key] = f.value;
      setValues(init);
      setErrors({});
    }
  }, [open, fields]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handler);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = async () => {
    const nextErrors: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.key] ?? '';
      if (f.required && !v.trim()) {
        nextErrors[f.key] = 'Champ requis';
        continue;
      }
      if (f.validate) {
        const err = f.validate(v);
        if (err) nextErrors[f.key] = err;
      }
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    try {
      const ok = await onSave(values);
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  const dialog = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Fermer"
        >
          <X size={18} />
        </button>
        <h2 className="text-base font-semibold text-gray-900 pr-8">{title}</h2>
        <div className="mt-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
              <input
                type={f.type ?? 'text'}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:border-blue-400 ${
                  errors[f.key] ? 'border-red-300' : 'border-gray-200'
                }`}
              />
              {errors[f.key] && <p className="text-xs text-red-600 mt-0.5">{errors[f.key]}</p>}
            </div>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1B2A4A] text-white rounded-xl text-sm hover:bg-[#243660] disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(dialog, document.body);
}
