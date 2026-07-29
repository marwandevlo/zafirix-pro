'use client';

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
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

function itemButtonClasses(variant: ActionItem['variant']): string {
  switch (variant) {
    case 'danger':
      return 'text-red-600 hover:bg-red-50 hover:text-red-700 font-medium';
    case 'warning':
      return 'text-amber-700 hover:bg-amber-50 hover:text-amber-800 font-medium';
    case 'success':
      return 'text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 font-medium';
    default:
      return 'text-gray-700 hover:bg-gray-50 hover:text-gray-900';
  }
}

function itemIconClasses(variant: ActionItem['variant']): string {
  switch (variant) {
    case 'danger':
      return 'shrink-0 text-red-500';
    case 'warning':
      return 'shrink-0 text-amber-600';
    case 'success':
      return 'shrink-0 text-emerald-600';
    default:
      return 'shrink-0 text-gray-500';
  }
}

function MenuDivider() {
  return <div className="mx-3 my-1 border-t border-gray-100" role="separator" />;
}

function renderActionItem(item: ActionItem, onSelect: () => void) {
  if (item.disabled) {
    return (
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
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        item.onClick();
        onSelect();
      }}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${itemButtonClasses(item.variant)}`}
    >
      <item.Icon size={15} className={itemIconClasses(item.variant)} />
      <span>{item.label}</span>
    </button>
  );
}

// ── Desktop dropdown (portal — avoids table overflow clipping) ─────────────────

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
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const visible = actions.filter((a) => !a.hidden);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const rect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const gap = 6;
    let top = rect.bottom + gap;
    let left = rect.right - menuRect.width;

    if (top + menuRect.height > window.innerHeight - gap) {
      top = Math.max(gap, rect.top - menuRect.height - gap);
    }
    left = Math.max(gap, Math.min(left, window.innerWidth - menuRect.width - gap));
    setCoords({ top, left });
  }, [triggerRef]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition, visible.length]);

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

  useEffect(() => {
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [updatePosition]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!visible.length) return null;

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      style={{
        top: coords?.top ?? -9999,
        left: coords?.left ?? -9999,
        visibility: coords ? 'visible' : 'hidden',
      }}
      className="fixed z-[200] min-w-[200px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden py-1"
    >
      {visible.map((item, idx) => {
        const prev = visible[idx - 1];
        const dividerBefore = idx > 0 && item.variant === 'danger' && prev?.variant !== 'danger';
        return (
          <div key={item.id}>
            {dividerBefore && <MenuDivider />}
            {renderActionItem(item, onClose)}
            {item.dividerAfter && idx < visible.length - 1 && <MenuDivider />}
          </div>
        );
      })}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(menu, document.body);
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

  const visible = actions.filter((a) => !a.hidden);

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
          {visible.map((item, idx) => {
            const prev = visible[idx - 1];
            const dividerBefore =
              idx > 0 && item.variant === 'danger' && prev?.variant !== 'danger';
            return (
              <div key={item.id}>
                {dividerBefore && <div className="mx-5 border-t border-gray-100 my-1" />}
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
                    onClick={() => {
                      item.onClick();
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-5 py-3.5 text-sm transition-colors ${itemButtonClasses(item.variant)}`}
                  >
                    <item.Icon size={18} className={itemIconClasses(item.variant)} />
                    <span>{item.label}</span>
                  </button>
                )}
                {item.dividerAfter && idx < visible.length - 1 && (
                  <div className="mx-5 border-t border-gray-100 my-1" />
                )}
              </div>
            );
          })}
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
 * - Desktop: fixed portal dropdown (not clipped by table overflow)
 * - Mobile (< 640px): slides up from bottom of screen
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

  const visible = actions.filter((a) => !a.hidden);
  if (!visible.length) return null;

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors ${triggerClassName ?? 'p-1.5'}`}
        aria-label="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>

      {open &&
        (isMobile ? (
          <MobileSheet actions={actions} entityLabel={entityLabel} onClose={close} />
        ) : (
          <DesktopDropdown actions={actions} onClose={close} triggerRef={triggerRef} />
        ))}
    </div>
  );
}
