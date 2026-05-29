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

  const rate = checkAiRateLimit(`tts:${session.userId}`);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  try {
    const { text, voice = 'echo' } = await request.json();

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: String(text ?? '').substring(0, 500),
        voice,
        speed: 1.05,
      }),
    });

    if (!response.ok) throw new Error('OpenAI TTS error');
    const audioBuffer = await response.arrayBuffer();
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    await captureAtlasServerException(error, { route: '/api/tts' });
    return NextResponse.json({ error: 'TTS failed' }, { status: 500 });
  }
}
