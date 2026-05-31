/**
 * Server-side preparation of uploaded images (compress for OCR without user action).
 */

import sharp from 'sharp';
import { isPdfMimeType } from '@/app/lib/atlas-document-storage';
import { ANTHROPIC_MAX_IMAGE_BYTES, type PreparedOcrImage } from '@/app/lib/atlas-ocr-image-prep';

const SAFE_TARGET_BYTES = 4 * 1024 * 1024;

/** Compress when raw image exceeds OCR-friendly size (never ask user to compress). */
export const IMAGE_AUTO_COMPRESS_THRESHOLD_BYTES = SAFE_TARGET_BYTES;

export type PreparedUploadImage = {
  originalBuffer: Buffer;
  ocrBuffer: Buffer;
  ocrMimeType: 'image/jpeg' | 'image/png';
  originalBytes: number;
  ocrBytes: number;
  compressed: boolean;
};

async function compressImageBuffer(input: Buffer, mimeHint: string): Promise<PreparedOcrImage> {
  const isPng = mimeHint.includes('png');
  if (input.length <= SAFE_TARGET_BYTES && isPng) {
    return {
      buffer: input,
      mimeType: 'image/png',
      originalBytes: input.length,
      preparedBytes: input.length,
    };
  }

  let width = 2200;
  let quality = 88;
  let prepared = await sharp(input)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  while (prepared.length > SAFE_TARGET_BYTES && quality > 45) {
    quality -= 10;
    prepared = await sharp(input)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  while (prepared.length > SAFE_TARGET_BYTES && width > 900) {
    width -= 200;
    prepared = await sharp(input)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: Math.max(quality, 55), mozjpeg: true })
      .toBuffer();
  }

  if (prepared.length > ANTHROPIC_MAX_IMAGE_BYTES) {
    throw new Error('image_compress_failed');
  }

  return {
    buffer: prepared,
    mimeType: 'image/jpeg',
    originalBytes: input.length,
    preparedBytes: prepared.length,
  };
}

export async function prepareUploadedImageForOcr(
  bytes: Buffer,
  mimeType: string,
): Promise<PreparedUploadImage> {
  if (isPdfMimeType(mimeType)) {
    throw new Error('prepareUploadedImageForOcr does not accept PDF');
  }

  const originalBytes = bytes.length;
  const needsCompress = originalBytes > IMAGE_AUTO_COMPRESS_THRESHOLD_BYTES;

  if (!needsCompress) {
    const mt = mimeType.includes('png') ? 'image/png' : 'image/jpeg';
    return {
      originalBuffer: bytes,
      ocrBuffer: bytes,
      ocrMimeType: mt as 'image/jpeg' | 'image/png',
      originalBytes,
      ocrBytes: originalBytes,
      compressed: false,
    };
  }

  const prepared = await compressImageBuffer(bytes, mimeType);
  return {
    originalBuffer: bytes,
    ocrBuffer: prepared.buffer,
    ocrMimeType: prepared.mimeType,
    originalBytes,
    ocrBytes: prepared.preparedBytes,
    compressed: true,
  };
}
