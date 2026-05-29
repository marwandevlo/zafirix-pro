import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { atlasDataBackend } from '@/app/lib/atlas-data-source';
import { ATLAS_DOCUMENTS_BUCKET } from '@/app/lib/atlas-document-storage';
import { isUuid } from '@/app/lib/admin/atlas-admin-profile-fields';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (atlasDataBackend() !== 'supabase') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 400 });
  }

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* noop */
        }
      },
    },
  });

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.id) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { data: row, error } = await supabase
    .from('atlas_documents')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row?.storage_path) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const expires = Number(request.nextUrl.searchParams.get('expires') ?? '3600');
  const expiresIn = Number.isFinite(expires) ? Math.min(Math.max(expires, 60), 86400) : 3600;

  const { data: signed, error: signErr } = await supabase.storage
    .from(ATLAS_DOCUMENTS_BUCKET)
    .createSignedUrl(row.storage_path, expiresIn);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message ?? 'signed_url_failed' }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl, expiresIn });
}
