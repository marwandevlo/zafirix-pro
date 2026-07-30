import { NextRequest, NextResponse } from 'next/server';
import {
  AuditorPassError,
  buildVerificationReport,
  recordAuditorAccess,
  validateAuditorPass,
  verificationReportToCsv,
} from '@/app/lib/atlas-auditor-pass-server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientIp(request: NextRequest): string | undefined {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? undefined;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 });

  const admin = getSupabaseServiceRoleClient();
  const format = new URL(request.url).searchParams.get('format') ?? 'json';

  try {
    const pass = await validateAuditorPass(admin, token);
    const report = await buildVerificationReport(admin, pass);

    await recordAuditorAccess(admin, pass, 'export_verification', {
      resource: format,
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
      metadata: { integrityHash: report.integrityHash },
    });

    if (format === 'csv') {
      const csv = verificationReportToCsv(report);
      const filename = `verification-audit-${report.companyName.replace(/\s+/g, '_')}-${report.generatedAt.slice(0, 10)}.csv`;
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ ok: true, report });
  } catch (e) {
    if (e instanceof AuditorPassError) {
      const status = e.code === 'expired' ? 410 : e.code === 'forbidden' ? 403 : 404;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    return NextResponse.json({ error: 'export_failed' }, { status: 500 });
  }
}
