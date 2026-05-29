type FetchAiArgs = {
  type: 'consultant' | 'juridique' | 'ocr' | 'assistant';
  message?: string;
  imageBase64?: string;
  mimeType?: string;
  systemPrompt?: string;
};

/**
 * Thin client wrapper around `/api/ai`.
 * Uses `credentials: 'include'` so the Supabase session cookie is sent; `/api/ai` resolves
 * the user server-side. For anonymous local demos only, set env `ATLAS_AI_ALLOW_ANON=true`
 * (never in production).
 */
export function fetchAi(args: FetchAiArgs): Promise<Response> {
  return fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(args),
  });
}

