/** OpenAI API key — runtime only (same pattern as anthropic-env). */
export function getOpenAiApiKey(): string | null {
  const raw = process.env['OPENAI_API_KEY'];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isOpenAiConfigured(): boolean {
  return getOpenAiApiKey() !== null;
}
