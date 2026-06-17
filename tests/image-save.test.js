import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { saveImage } from '../src/fs/saveImage.js';
import { PNG_BASE64, makeTempDir } from './helpers.js';

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
    dither: 'bayer2'
  });

  const bytes = await fs.readFile(outputPath);
  assert.equal(bytes.readUInt32BE(16), 4);
  assert.equal(bytes.readUInt32BE(20), 4);
  const preview = await fs.readFile(result.previewPath);
  assert.equal(preview.readUInt32BE(16), 12);
  assert.equal(preview.readUInt32BE(20), 12);
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
