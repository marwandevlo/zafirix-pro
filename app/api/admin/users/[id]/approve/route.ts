import { NextRequest, NextResponse } from 'next/server';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { requireAdmin } from '@/app/lib/admin/require-admin';
import { approveUserAccount } from '@/app/lib/admin/approve-user-account';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/admin/users/:id/approve
 * Sets profiles.status to active and queues the French approval email (non-blocking).
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const result = await approveUserAccount({
    userId: id,
    adminUserId: guard.adminUserId,
    adminEmail: guard.adminEmail,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message ?? result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    user: result.user,
    alreadyApproved: result.alreadyApproved,
    emailQueued: result.emailQueued,
  });
}
