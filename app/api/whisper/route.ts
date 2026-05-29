import { NextRequest, NextResponse } from 'next/server';
import { requireAtlasSupabaseSession } from '@/app/lib/atlas-api-session';
import { checkAiRateLimit } from '@/app/lib/ai-rate-limit';
import { captureAtlasServerException } from '@/app/lib/atlas-server-log';

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
  }

  const session = await requireAtlasSupabaseSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: 'auth_required' }, { status: session.status });
  }

  const rate = checkAiRateLimit(`whisper:${session.userId}`);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  try {
    const formData = await request.formData();
    const audio = formData.get('audio') as Blob;
    if (!audio) return NextResponse.json({ error: 'No audio' }, { status: 400 });

    const whisperForm = new FormData();
    whisperForm.append('file', audio, 'audio.webm');
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('prompt', 'دارجة مغربية مخلوطة بالفرنسية. مصطلحات: TVA، IS، IR، CNSS، AMO، facture، bilan، trimestre، déclaration، شركة، ضريبة، فاتورة، محاسبة، ربح، خسارة، راس المال');
    whisperForm.append('response_format', 'json');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: whisperForm,
    });

    if (!response.ok) throw new Error('Whisper error');
    const data = await response.json();
    return NextResponse.json({ text: data.text });
  } catch (error) {
    await captureAtlasServerException(error, { route: '/api/whisper' });
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
