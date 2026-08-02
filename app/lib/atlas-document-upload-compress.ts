/**
 * Client-side image/PDF compression before Supabase Storage upload.
 * Reduces bandwidth and upload time; server may still normalize for OCR.
 */

import {
  ATLAS_DOCUMENT_MAX_IMAGE_BYTES,
  ATLAS_DOCUMENT_MAX_PDF_BYTES,
  inferDocumentMimeType,
  isPdfMimeType,
} from '@/app/lib/atlas-document-storage';

/** Compress images above this size (bytes). */
export const CLIENT_IMAGE_COMPRESS_THRESHOLD_BYTES = 400 * 1024;

/** Target max size for client-compressed images. */
export const CLIENT_IMAGE_TARGET_BYTES = 3 * 1024 * 1024;

/** Attempt PDF optimization above this size. */
export const CLIENT_PDF_COMPRESS_THRESHOLD_BYTES = 1.5 * 1024 * 1024;

const IMAGE_MAX_WIDTH = 2200;

export type PreparedUploadFile = {
  file: File;
  mimeType: string;
  originalBytes: number;
  preparedBytes: number;
  compressed: boolean;
};

function replaceExtension(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  return `${base}.${ext}`;
}

async function loadImageBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image_decode_failed'));
      el.src = url;
    });
    return createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

async function compressImageFile(file: File, mimeType: string): Promise<PreparedUploadFile> {
  const originalBytes = file.size;
  if (originalBytes <= CLIENT_IMAGE_COMPRESS_THRESHOLD_BYTES) {
    return { file, mimeType, originalBytes, preparedBytes: originalBytes, compressed: false };
  }

  const bitmap = await loadImageBitmap(file);
  const scale = Math.min(1, IMAGE_MAX_WIDTH / Math.max(bitmap.width, 1));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return { file, mimeType, originalBytes, preparedBytes: originalBytes, compressed: false };
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let bestBlob: Blob | null = null;
  for (let quality = 0.88; quality >= 0.5; quality -= 0.08) {
    const blob = await canvasToBlob(canvas, quality);
    if (!blob) continue;
    bestBlob = blob;
    if (blob.size <= CLIENT_IMAGE_TARGET_BYTES) break;
  }

  if (!bestBlob || bestBlob.size >= originalBytes * 0.97) {
    return { file, mimeType, originalBytes, preparedBytes: originalBytes, compressed: false };
  }

  const outMime = 'image/jpeg';
  const outName = mimeType.includes('jpeg') || mimeType.includes('jpg') ? file.name : replaceExtension(file.name, 'jpg');
  const outFile = new File([bestBlob], outName, { type: outMime, lastModified: file.lastModified });

  if (outFile.size > ATLAS_DOCUMENT_MAX_IMAGE_BYTES) {
    return { file, mimeType, originalBytes, preparedBytes: originalBytes, compressed: false };
  }

  return {
    file: outFile,
    mimeType: outMime,
    originalBytes,
    preparedBytes: outFile.size,
    compressed: true,
  };
}

async function compressPdfFile(file: File): Promise<PreparedUploadFile> {
  const originalBytes = file.size;
  const mimeType = 'application/pdf';

  if (originalBytes <= CLIENT_PDF_COMPRESS_THRESHOLD_BYTES) {
    return { file, mimeType, originalBytes, preparedBytes: originalBytes, compressed: false };
  }

  try {
    const { PDFDocument } = await import('pdf-lib');
    const input = await file.arrayBuffer();
    const pdf = await PDFDocument.load(input, { ignoreEncryption: true });
    const saved = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
    const preparedBytes = saved.byteLength;

    if (preparedBytes >= originalBytes * 0.95 || preparedBytes > ATLAS_DOCUMENT_MAX_PDF_BYTES) {
      return { file, mimeType, originalBytes, preparedBytes: originalBytes, compressed: false };
    }

    const outFile = new File([new Uint8Array(saved)], file.name, { type: mimeType, lastModified: file.lastModified });
    return { file: outFile, mimeType, originalBytes, preparedBytes: outFile.size, compressed: true };
  } catch {
    return { file, mimeType, originalBytes, preparedBytes: originalBytes, compressed: false };
  }
}

/** Compress image or PDF client-side when beneficial. Falls back to original on any error. */
export async function prepareFileForUpload(file: File): Promise<PreparedUploadFile> {
  const mimeType = inferDocumentMimeType(file) ?? file.type;
  try {
    if (isPdfMimeType(mimeType)) {
      return await compressPdfFile(file);
    }
    if (mimeType.startsWith('image/')) {
      return await compressImageFile(file, mimeType);
    }
  } catch {
    /* best effort — upload original */
  }
  return {
    file,
    mimeType,
    originalBytes: file.size,
    preparedBytes: file.size,
    compressed: false,
  };
}
