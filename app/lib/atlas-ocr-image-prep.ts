/**
 * Compress/resize rendered PDF pages to fit Anthropic image limits (5 MB raw base64 payload).
 */

import sharp from 'sharp';

/** Anthropic base64 image limit is 5 MB (5242880 bytes). */
export const ANTHROPIC_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SAFE_TARGET_BYTES = 4 * 1024 * 1024;

export type PreparedOcrImage = {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png';
  originalBytes: number;
  preparedBytes: number;
};

export async function preparePdfPageForOcr(pngBuffer: Buffer): Promise<PreparedOcrImage> {
  const originalBytes = pngBuffer.length;

  if (originalBytes <= SAFE_TARGET_BYTES) {
    return {
      buffer: pngBuffer,
      mimeType: 'image/png',
      originalBytes,
      preparedBytes: originalBytes,
    };
  }

  let width = 1800;
  let quality = 85;
  let prepared = await sharp(pngBuffer)
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  while (prepared.length > SAFE_TARGET_BYTES && quality > 45) {
    quality -= 10;
    prepared = await sharp(pngBuffer)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  while (prepared.length > SAFE_TARGET_BYTES && width > 900) {
    width -= 200;
    prepared = await sharp(pngBuffer)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: Math.max(quality, 55), mozjpeg: true })
      .toBuffer();
  }

  if (prepared.length > ANTHROPIC_MAX_IMAGE_BYTES) {
    throw new Error(
      `Rendered PDF page exceeds OCR size limit after compression (${prepared.length} bytes > ${ANTHROPIC_MAX_IMAGE_BYTES})`,
    );
  }

  return {
    buffer: prepared,
    mimeType: 'image/jpeg',
    originalBytes,
    preparedBytes: prepared.length,
  };
}

export function parseAnthropicOcrError(err: unknown): { code: string; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('exceeds 5 MB maximum') || message.includes('5242880')) {
    return {
      code: 'image_too_large',
      message: 'Rendered PDF page exceeds Anthropic 5 MB image limit',
    };
  }
  return { code: 'ai_provider_error', message };
}
