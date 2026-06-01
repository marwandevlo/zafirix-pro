/**
 * Tests Anthropic native PDF document block directly.
 */
import { readFileSync, existsSync } from 'fs';

// Load .env.local manually
if (existsSync('.env.local')) {
  const lines = readFileSync('.env.local', 'utf-8').split('\n');
  for (const line of lines) {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = val;
    }
  }
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY not found');
  process.exit(1);
}
console.log('API key:', apiKey.slice(0, 8) + '...');

const { default: Anthropic } = await import('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey });

const testFile = 'scripts/test-fixtures/test-1page.pdf';
if (!existsSync(testFile)) {
  console.error('Test file not found:', testFile);
  process.exit(1);
}

const pdfBytes = readFileSync(testFile);
const pdfBase64 = pdfBytes.toString('base64');
console.log('PDF size:', pdfBytes.length, 'bytes');

const t0 = Date.now();
try {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }
        },
        { type: 'text', text: 'How many pages does this PDF have? Reply with just a number.' }
      ]
    }]
  });

  const elapsed = Date.now() - t0;
  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
  console.log(`\n✓ Response in ${elapsed}ms: "${text}"`);
  console.log('Usage:', JSON.stringify(response.usage));
} catch (err) {
  console.error(`✗ Error after ${Date.now() - t0}ms:`, err.message);
  if (err.status) console.error('Status:', err.status, err.error);
}
