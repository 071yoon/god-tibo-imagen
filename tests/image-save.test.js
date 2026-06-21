import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

import { saveImage } from '../src/fs/saveImage.js';
import { processPixelArtPngBytes } from '../src/fs/pngResize.js';
import { PNG_BASE64, makeTempDir } from './helpers.js';

const CHECKER_BACKGROUND_RGB_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAJUlEQVR4nGP48OHDnTt3ICQDEFcEGG1pCgDyGYAYyAIiqAxcJQDWmyXlOmGFQwAAAABJRU5ErkJggg==';

function inflatePngImageData(bytes) {
  const chunks = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (type === 'IDAT') {
      chunks.push(bytes.subarray(dataStart, dataEnd));
    }
    offset = dataEnd + 4;
  }
  return zlib.inflateSync(Buffer.concat(chunks));
}

test('saveImage writes decoded PNG bytes to disk', async () => {
  const dir = await makeTempDir();
  const outputPath = path.join(dir, 'image.png');
  const saved = await saveImage({ resultBase64: PNG_BASE64, outputPath });

  assert.equal(saved, outputPath);
  const bytes = await fs.readFile(outputPath);
  assert.ok(bytes.length > 10);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('saveImage can resize PNG output for pixel art workflows', async () => {
  const dir = await makeTempDir();
  const outputPath = path.join(dir, 'pixel.png');
  await saveImage({ resultBase64: PNG_BASE64, outputPath, pixelSize: '2x3' });

  const bytes = await fs.readFile(outputPath);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 2);
  assert.equal(bytes.readUInt32BE(20), 3);
});

test('saveImage can preserve the raw backend PNG separately', async () => {
  const dir = await makeTempDir();
  const outputPath = path.join(dir, 'pixel.png');
  const rawOutputPath = path.join(dir, 'raw.png');
  const result = await saveImage({
    resultBase64: PNG_BASE64,
    outputPath,
    rawOutputPath,
    pixelSize: '2x3',
    returnMetadata: true
  });

  assert.equal(result.savedPath, outputPath);
  assert.equal(result.rawPath, rawOutputPath);
  const raw = await fs.readFile(rawOutputPath);
  assert.equal(raw.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.notEqual(raw.readUInt32BE(16), 2);
  assert.notEqual(raw.readUInt32BE(20), 3);
});

test('saveImage can apply pixel mode palette cleanup and write a preview', async () => {
  const dir = await makeTempDir();
  const outputPath = path.join(dir, 'pixel-mode.png');
  const result = await saveImage({
    resultBase64: PNG_BASE64,
    outputPath,
    pixelSize: 4,
    pixelMode: true,
    pixelPalette: 4,
    pixelDither: 'bayer2',
    previewUpscale: 3,
    returnMetadata: true
  });

  assert.equal(result.savedPath, outputPath);
  assert.equal(result.previewPath, path.join(dir, 'pixel-mode.preview.png'));
  assert.deepEqual(result.pixelMetadata, {
    width: 4,
    height: 4,
    paletteSize: 4,
    actualPaletteSize: 1,
    dither: 'bayer2',
    outline: 'soft',
    outlineBoostedPixels: 0
  });

  const bytes = await fs.readFile(outputPath);
  assert.equal(bytes.readUInt32BE(16), 4);
  assert.equal(bytes.readUInt32BE(20), 4);
  const preview = await fs.readFile(result.previewPath);
  assert.equal(preview.readUInt32BE(16), 12);
  assert.equal(preview.readUInt32BE(20), 12);
});

test('saveImage supports strong pixel outline contrast metadata', async () => {
  const dir = await makeTempDir();
  const outputPath = path.join(dir, 'pixel-outline.png');
  const result = await saveImage({
    resultBase64: PNG_BASE64,
    outputPath,
    pixelSize: 4,
    pixelMode: true,
    pixelPalette: 4,
    pixelOutline: 'strong',
    returnMetadata: true
  });

  assert.equal(result.pixelMetadata.outline, 'strong');
  assert.equal(typeof result.pixelMetadata.outlineBoostedPixels, 'number');
});

test('pixel mode removes edge-connected checker backgrounds and keeps RGBA transparency', async () => {
  const result = processPixelArtPngBytes(Buffer.from(CHECKER_BACKGROUND_RGB_PNG_BASE64, 'base64'), {
    pixelSize: 4,
    paletteSize: 4,
    outline: 'soft'
  });

  assert.equal(result.bytes[25], 6);
  assert.ok(result.metadata.outlineBoostedPixels <= 8);

  const inflated = inflatePngImageData(result.bytes);
  const stride = 4 * 4;
  const cornerAlpha = inflated[1 + 3];
  const centerAlpha = inflated[(1 * (stride + 1)) + 1 + (1 * 4) + 3];
  assert.equal(cornerAlpha, 0);
  assert.equal(centerAlpha, 255);
});

test('saveImage rejects data URLs', async () => {
  const dir = await makeTempDir();
  await assert.rejects(
    saveImage({ resultBase64: 'data:image/png;base64,AAAA', outputPath: path.join(dir, 'bad.png') }),
    /data URL/
  );
});

test('saveImage rejects non-standard base64', async () => {
  const dir = await makeTempDir();
  await assert.rejects(saveImage({ resultBase64: '_-8', outputPath: path.join(dir, 'bad.png') }), /not standard base64/);
});
