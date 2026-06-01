'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionItem = {
  id: string;
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'warning' | 'success';
  /** If true, renders as disabled with a tooltip. */
  disabled?: boolean;
  disabledReason?: string;
  /** If true, item is completely hidden (not rendered). */
  hidden?: boolean;
  /** Renders a horizontal separator line after this item. */
  dividerAfter?: boolean;
};

type EntityActionMenuProps = {
  actions: ActionItem[];
  entityLabel?: string;
  /** Trigger button size class. Defaults to 'p-1.5'. */
  triggerClassName?: string;
};

// ── Color variants ─────────────────────────────────────────────────────────────

const ITEM_STYLES: Record<NonNullable<ActionItem['variant']>, string> = {
  default: 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
  danger: 'text-red-600 hover:bg-red-50 hover:text-red-700',
  warning: 'text-amber-700 hover:bg-amber-50 hover:text-amber-800',
  success: 'text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800',
};

// ── Desktop dropdown ───────────────────────────────────────────────────────────

function DesktopDropdown({
  actions,
  onClose,
  triggerRef,
}: {
  actions: ActionItem[];
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, triggerRef]);

  const visible = actions.filter(a => !a.hidden);
  if (!visible.length) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
    >
      {visible.map((item, idx) => (
        <div key={item.id}>
          {item.disabled ? (
            <div
              className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-400 cursor-not-allowed select-none"
              title={item.disabledReason ?? 'Bientôt disponible'}
              role="menuitem"
              aria-disabled="true"
            >
              <item.Icon size={15} className="shrink-0 opacity-50" />
              <span>{item.label}</span>
              <span className="ml-auto text-[10px] bg-gray-100 text-gray-400 rounded px-1.5 py-0.5">Bientôt</span>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => { item.onClick(); onClose(); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${ITEM_STYLES[item.variant ?? 'default']}`}
            >
              <item.Icon size={15} className="shrink-0" />
              <span>{item.label}</span>
            </button>
          )}
          {item.dividerAfter && idx < visible.length - 1 && (
            <div className="mx-3 border-t border-gray-100" />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Mobile bottom sheet ────────────────────────────────────────────────────────

function MobileSheet({
  actions,
  entityLabel,
  onClose,
}: {
  actions: ActionItem[];
  entityLabel?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handler);
    };
  }, [onClose]);

  const visible = actions.filter(a => !a.hidden);

  const sheet = (
    <div className="fixed inset-0 z-[150]" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-800 truncate">
            {entityLabel ?? 'Actions'}
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="py-2 max-h-[60vh] overflow-y-auto">
          {visible.map((item, idx) => (
            <div key={item.id}>
              {item.disabled ? (
                <div
                  className="flex items-center gap-3 px-5 py-3.5 text-sm text-gray-400 cursor-not-allowed"
                  title={item.disabledReason}
                >
                  <item.Icon size={18} className="shrink-0 opacity-50" />
                  <span>{item.label}</span>
                  <span className="ml-auto text-[10px] bg-gray-100 text-gray-400 rounded px-1.5 py-0.5">Bientôt</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { item.onClick(); onClose(); }}
                  className={`w-full flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors ${ITEM_STYLES[item.variant ?? 'default']}`}
                >
                  <item.Icon size={18} className="shrink-0" />
                  <span>{item.label}</span>
                </button>
              )}
              {item.dividerAfter && idx < visible.length - 1 && (
                <div className="mx-5 border-t border-gray-100 my-1" />
              )}
            </div>
          ))}
        </div>
        <div className="h-safe-area-inset-bottom" />
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(sheet, document.body);
}

// ── EntityActionMenu ───────────────────────────────────────────────────────────

/**
 * Three-dot action menu:
 * - Desktop: absolute dropdown below trigger
 * - Mobile (< 640px): slides up from bottom of screen
 *
 * Usage:
 *   <div className="relative">
 *     <EntityActionMenu actions={actions} />
 *   </div>
 */
export function EntityActionMenu({ actions, entityLabel, triggerClassName }: EntityActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const visible = actions.filter(a => !a.hidden);
  if (!visible.length) return null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
        className={`text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors ${triggerClassName ?? 'p-1.5'}`}
        aria-label="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        isMobile ? (
          <MobileSheet
            actions={actions}
            entityLabel={entityLabel}
            onClose={close}
          />
        ) : (
          <DesktopDropdown
            actions={actions}
            onClose={close}
            triggerRef={triggerRef}
          />
        )
      )}
    </div>
  );
}
