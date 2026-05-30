/**
 * Anthropic API key — read at **request/runtime** only.
 * Bracket access avoids Next.js baking an empty value at build time when the key
 * is added in Vercel after the first deploy.
 */
export function getAnthropicApiKey(): string | null {
  const raw = process.env['ANTHROPIC_API_KEY'];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isAnthropicConfigured(): boolean {
  return getAnthropicApiKey() !== null;
}
