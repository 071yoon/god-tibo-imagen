import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { animatePixelPngToGif } from '../src/fs/gifAnimate.js';
import { PNG_BASE64, makeTempDir } from './helpers.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const cliPath = path.join(rootDir, 'src', 'cli', 'animateGif.js');

function countGifFrames(bytes) {
  let count = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0x2c) count += 1;
  }
  return count;
}

async function canRun(command) {
  try {
    await execFileAsync('which', [command]);
    return true;
  } catch {
    return false;
  }
}

test('animatePixelPngToGif creates an animated GIF from a PNG', async () => {
  const dir = await makeTempDir();
  const inputPath = path.join(dir, 'sprite.png');
  const outputPath = path.join(dir, 'sprite.gif');
  await fs.writeFile(inputPath, Buffer.from(PNG_BASE64, 'base64'));

  const result = await animatePixelPngToGif({
    inputPath,
    outputPath,
    frames: 4,
    delay: 7,
    effect: 'pulse'
  });

  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
  assert.equal(result.frames, 4);
  assert.equal(result.delay, 7);
  assert.equal(result.effect, 'pulse');

  const bytes = await fs.readFile(outputPath);
  assert.equal(bytes.subarray(0, 6).toString('ascii'), 'GIF89a');
  assert.equal(bytes.readUInt16LE(6), 1);
  assert.equal(bytes.readUInt16LE(8), 1);
  assert.equal(countGifFrames(bytes), 4);

  if (await canRun('sips')) {
    const { stdout } = await execFileAsync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', outputPath]);
    assert.match(stdout, /pixelWidth: 1/);
    assert.match(stdout, /pixelHeight: 1/);
  }
});

test('gti-animate CLI writes JSON summary', async () => {
  const dir = await makeTempDir();
  const inputPath = path.join(dir, 'sprite.png');
  const outputPath = path.join(dir, 'sprite.gif');
  await fs.writeFile(inputPath, Buffer.from(PNG_BASE64, 'base64'));

  const { stdout } = await execFileAsync(process.execPath, [
    cliPath,
    '--input',
    inputPath,
    '--output',
    outputPath,
    '--frames',
    '3',
    '--delay',
    '5',
    '--effect',
    'hue'
  ]);
  const summary = JSON.parse(stdout);
  assert.equal(summary.outputPath, outputPath);
  assert.equal(summary.frames, 3);
  assert.equal(summary.effect, 'hue');
  assert.equal((await fs.readFile(outputPath)).subarray(0, 6).toString('ascii'), 'GIF89a');
});

test('animatePixelPngToGif supports typing motion effect', async () => {
  const dir = await makeTempDir();
  const inputPath = path.join(dir, 'sprite.png');
  const outputPath = path.join(dir, 'typing.gif');
  await fs.writeFile(inputPath, Buffer.from(PNG_BASE64, 'base64'));

  const result = await animatePixelPngToGif({
    inputPath,
    outputPath,
    frames: 4,
    effect: 'typing'
  });

  assert.equal(result.effect, 'typing');
  const bytes = await fs.readFile(outputPath);
  assert.equal(bytes.subarray(0, 6).toString('ascii'), 'GIF89a');
  assert.equal(countGifFrames(bytes), 4);
});

test('animatePixelPngToGif supports fixed-position salt effect', async () => {
  const dir = await makeTempDir();
  const inputPath = path.join(dir, 'sprite.png');
  const outputPath = path.join(dir, 'salt.gif');
  await fs.writeFile(inputPath, Buffer.from(PNG_BASE64, 'base64'));

  const result = await animatePixelPngToGif({
    inputPath,
    outputPath,
    frames: 4,
    effect: 'salt'
  });

  assert.equal(result.effect, 'salt');
  const bytes = await fs.readFile(outputPath);
  assert.equal(bytes.subarray(0, 6).toString('ascii'), 'GIF89a');
  assert.equal(countGifFrames(bytes), 4);
});
