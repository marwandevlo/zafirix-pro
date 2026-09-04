'use client';

import { useState } from 'react';
import { approveUser } from '@/app/actions/admin';
import { adminAuthedFetch } from '@/app/lib/admin/admin-client-auth';
import { AdminStatusBadge } from '@/app/admin/_components/AdminStatusBadge';
import { isOwnerEmail } from '@/app/lib/owner';

export type UserApprovalRowUser = {
  id: string;
  email: string;
  full_name?: string;
  status?: string;
};

export type ApprovedUserPatch = {
  id: string;
  email: string;
  full_name?: string;
  status: string;
};

type Props = {
  user: UserApprovalRowUser;
  busy?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onApproved?: (user: ApprovedUserPatch) => void;
  onError?: (message: string) => void;
  showStatus?: boolean;
  confirm?: boolean;
};

function isPendingStatus(status?: string | null): boolean {
  return String(status ?? '').trim().toLowerCase() === 'pending';
}

export function UserApprovalRow({
  user,
  busy = false,
  onBusyChange,
  onApproved,
  onError,
  showStatus = true,
  confirm = true,
}: Props) {
  const [localBusy, setLocalBusy] = useState(false);
  const pending = isPendingStatus(user.status);
  const protectedOwner = isOwnerEmail(user.email);
  const isBusy = busy || localBusy;

  const run = async () => {
    if (!pending || protectedOwner || isBusy) return;
    if (confirm && !window.confirm('Approuver cet utilisateur ? Un e-mail de confirmation sera envoyé.')) {
      return;
    }

    setLocalBusy(true);
    onBusyChange?.(true);
    try {
      let next: ApprovedUserPatch | null = null;
      const actionResult = await approveUser(user.id);
      if (actionResult.ok) {
        next = {
          id: actionResult.user.id,
          email: actionResult.user.email || user.email,
          full_name: actionResult.user.full_name,
          status: actionResult.user.status || 'approved',
        };
      } else if (actionResult.error === 'auth_required' || actionResult.error === 'forbidden') {
        const res = await adminAuthedFetch(`/api/admin/users/${user.id}/approve`, { method: 'POST' });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          user?: ApprovedUserPatch;
        };
        if (!res.ok) throw new Error(json.message || json.error || 'error');
        next = json.user
          ? { ...json.user, status: json.user.status || 'active' }
          : { id: user.id, email: user.email, full_name: user.full_name, status: 'active' };
      } else {
        throw new Error(actionResult.message || actionResult.error);
      }

      onApproved?.(next);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Erreur');
    } finally {
      setLocalBusy(false);
      onBusyChange?.(false);
    }
  };

  if (!pending) {
    return showStatus ? <AdminStatusBadge value={user.status} /> : null;
  }

  return (
    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
      {showStatus ? <AdminStatusBadge value={user.status} /> : null}
      <button
        type="button"
        onClick={() => void run()}
        disabled={protectedOwner || isBusy}
        className="h-8 rounded-lg bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200 disabled:opacity-40"
      >
        {isBusy ? 'Approbation…' : 'Approve'}
      </button>
    </div>
  );
}
