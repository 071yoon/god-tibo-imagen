// @ts-nocheck
import fs from 'node:fs/promises';
import path from 'node:path';

import { processPixelArtPngBytes, resizePngBytes, upscalePngBytes } from './pngResize.js';

function assertStandardBase64(value) {
  if (/^data:/i.test(value)) {
    const error = new Error('Expected raw base64 PNG bytes, not a data URL.');
    error.code = 'UNSUPPORTED_DATA_URL';
    throw error;
  }

  if (!/^[A-Za-z0-9+/=\s]+$/.test(value)) {
    const error = new Error('Image payload is not standard base64.');
    error.code = 'INVALID_BASE64';
    throw error;
  }
}

/**
 * Decode a base64 PNG payload and save it to disk.
 *
 * @param {{ resultBase64: string, outputPath: string, pixelSize?: string | number, pixelMode?: boolean, pixelPalette?: string | number, pixelDither?: string, pixelOutline?: string, previewUpscale?: string | number, returnMetadata?: boolean }} options - Base64 image payload and destination path.
 * @returns {Promise<string | { savedPath: string, previewPath: string | null, pixelMetadata: unknown }>} The written output path by default, or output details when returnMetadata is true.
 */
export async function saveImage({
  resultBase64,
  outputPath,
  pixelSize,
  pixelMode = false,
  pixelPalette,
  pixelDither,
  pixelOutline,
  previewUpscale,
  returnMetadata = false
}) {
  assertStandardBase64(resultBase64);

  const bytes = Buffer.from(resultBase64.trim(), 'base64');
  if (!bytes.length) {
    const error = new Error('Decoded image payload is empty.');
    error.code = 'EMPTY_IMAGE_PAYLOAD';
    throw error;
  }

  let outputBytes = bytes;
  let pixelMetadata = null;
  if (pixelMode) {
    const processed = processPixelArtPngBytes(bytes, {
      pixelSize: pixelSize || '128',
      paletteSize: pixelPalette,
      dither: pixelDither,
      outline: pixelOutline
    });
    outputBytes = processed.bytes;
    pixelMetadata = processed.metadata;
  } else if (pixelSize) {
    outputBytes = resizePngBytes(bytes, pixelSize);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, outputBytes);

  let previewPath = null;
  if (previewUpscale) {
    const parsed = path.parse(outputPath);
    previewPath = path.join(parsed.dir, `${parsed.name}.preview${parsed.ext || '.png'}`);
    await fs.writeFile(previewPath, upscalePngBytes(outputBytes, previewUpscale));
  }

  const result = { savedPath: outputPath, previewPath, pixelMetadata };
  return returnMetadata ? result : outputPath;
}
