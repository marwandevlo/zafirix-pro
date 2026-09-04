'use server';

export { approveUser, approvePendingUser, type ApproveUserActionResult } from '@/app/actions/admin';
export type { ApprovedUserSnapshot } from '@/app/lib/admin/approve-user-account';
