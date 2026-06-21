// @ts-nocheck
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS_BY_COLOR_TYPE = new Map([
  [0, 1],
  [2, 3],
  [4, 2],
  [6, 4]
]);

let crcTable = null;

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(buffer) {
  crcTable ||= makeCrcTable();
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function readChunks(buffer) {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('Expected a PNG image.');
  }

  const chunks = [];
  let offset = PNG_SIGNATURE.length;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      throw new Error('Invalid PNG chunk length.');
    }
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd) });
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }
  return chunks;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterScanlines(data, width, height, channels) {
  const stride = width * channels;
  const output = Buffer.alloc(height * stride);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = data[inputOffset];
    inputOffset += 1;
    const rowOffset = y * stride;
    const prevRowOffset = rowOffset - stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = data[inputOffset + x];
      const left = x >= channels ? output[rowOffset + x - channels] : 0;
      const up = y > 0 ? output[prevRowOffset + x] : 0;
      const upLeft = y > 0 && x >= channels ? output[prevRowOffset + x - channels] : 0;
      let value;
      switch (filter) {
        case 0:
          value = raw;
          break;
        case 1:
          value = raw + left;
          break;
        case 2:
          value = raw + up;
          break;
        case 3:
          value = raw + Math.floor((left + up) / 2);
          break;
        case 4:
          value = raw + paethPredictor(left, up, upLeft);
          break;
        default:
          throw new Error(`Unsupported PNG filter type: ${filter}.`);
      }
      output[rowOffset + x] = value & 0xff;
    }
    inputOffset += stride;
  }
  return output;
}

function decodePngToRgba(bytes) {
  const chunks = readChunks(bytes);
  const ihdr = chunks.find((chunk) => chunk.type === 'IHDR')?.data;
  if (!ihdr) throw new Error('PNG is missing IHDR.');

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const compression = ihdr[10];
  const filter = ihdr[11];
  const interlace = ihdr[12];
  const channels = CHANNELS_BY_COLOR_TYPE.get(colorType);
  if (bitDepth !== 8 || compression !== 0 || filter !== 0 || interlace !== 0 || !channels) {
    throw new Error('Only non-interlaced 8-bit grayscale/RGB/RGBA PNG images can be animated.');
  }

  const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data));
  const pixels = unfilterScanlines(zlib.inflateSync(idat), width, height, channels);
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const sourceOffset = index * channels;
    const targetOffset = index * 4;
    if (channels === 1 || channels === 2) {
      rgba[targetOffset] = pixels[sourceOffset];
      rgba[targetOffset + 1] = pixels[sourceOffset];
      rgba[targetOffset + 2] = pixels[sourceOffset];
      rgba[targetOffset + 3] = channels === 2 ? pixels[sourceOffset + 1] : 255;
    } else {
      rgba[targetOffset] = pixels[sourceOffset];
      rgba[targetOffset + 1] = pixels[sourceOffset + 1];
      rgba[targetOffset + 2] = pixels[sourceOffset + 2];
      rgba[targetOffset + 3] = channels === 4 ? pixels[sourceOffset + 3] : 255;
    }
  }
  return { width, height, pixels: rgba };
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hashNoise(seed) {
  let value = seed | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) % 1000) / 1000;
}

function transformColor([red, green, blue], frameIndex, frameCount, effect, pixelIndex = 0) {
  if (effect === 'typing') {
    return [red, green, blue];
  }
  if (effect === 'salt') {
    const bucket = Math.floor(hashNoise((pixelIndex + 1) * 2654435761 + (frameIndex + 1) * 1013904223) * 3);
    const salt = [-8, 0, 8][bucket];
    return [
      clamp(red + salt),
      clamp(green + salt),
      clamp(blue + salt)
    ];
  }
  const phase = (frameIndex / frameCount) * Math.PI * 2;
  const pulse = Math.sin(phase);
  const wave = Math.sin(phase + ((red + green + blue) / 255));
  const amount = effect === 'pulse' ? 0.08 : effect === 'hue' ? 0.04 : 0.06;
  const brightness = 1 + (pulse * amount);
  const warm = effect === 'hue' ? wave * 7 : wave * 4;
  return [
    clamp((red * brightness) + warm),
    clamp((green * brightness) + (effect === 'hue' ? -warm * 0.3 : 0)),
    clamp((blue * brightness) - warm)
  ];
}

function findOpaqueBounds(source, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (source[offset + 3] < 128) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) {
    return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1, width, height };
  }
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function rectFromRatios(bounds, left, top, right, bottom) {
  return {
    x0: Math.max(0, Math.floor(bounds.minX + (bounds.width * left))),
    y0: Math.max(0, Math.floor(bounds.minY + (bounds.height * top))),
    x1: Math.min(bounds.maxX, Math.ceil(bounds.minX + (bounds.width * right))),
    y1: Math.min(bounds.maxY, Math.ceil(bounds.minY + (bounds.height * bottom)))
  };
}

function copyShiftedRegion(source, output, width, height, rect, dx, dy) {
  for (let y = rect.y0; y <= rect.y1; y += 1) {
    for (let x = rect.x0; x <= rect.x1; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      if (source[sourceOffset + 3] < 128) continue;
      const targetX = Math.max(0, Math.min(width - 1, x + dx));
      const targetY = Math.max(0, Math.min(height - 1, y + dy));
      const targetOffset = (targetY * width + targetX) * 4;
      output[targetOffset] = source[sourceOffset];
      output[targetOffset + 1] = source[sourceOffset + 1];
      output[targetOffset + 2] = source[sourceOffset + 2];
      output[targetOffset + 3] = source[sourceOffset + 3];
    }
  }
}

function clearRegion(output, width, rect) {
  for (let y = rect.y0; y <= rect.y1; y += 1) {
    for (let x = rect.x0; x <= rect.x1; x += 1) {
      output[(y * width + x) * 4 + 3] = 0;
    }
  }
}

function applyBrightnessRegion(output, width, rect, factor) {
  for (let y = rect.y0; y <= rect.y1; y += 1) {
    for (let x = rect.x0; x <= rect.x1; x += 1) {
      const offset = (y * width + x) * 4;
      if (output[offset + 3] < 128) continue;
      output[offset] = clamp(output[offset] * factor);
      output[offset + 1] = clamp(output[offset + 1] * factor);
      output[offset + 2] = clamp(output[offset + 2] * factor);
    }
  }
}

function buildMotionFrame(source, width, height, frameIndex, frameCount, effect) {
  if (effect !== 'typing') {
    return source;
  }

  const output = Buffer.from(source);
  const bounds = findOpaqueBounds(source, width, height);
  const leftHand = rectFromRatios(bounds, 0.18, 0.62, 0.47, 0.88);
  const rightHand = rectFromRatios(bounds, 0.53, 0.62, 0.82, 0.88);
  const upperBody = rectFromRatios(bounds, 0.18, 0.08, 0.82, 0.62);
  const screen = rectFromRatios(bounds, 0.34, 0.48, 0.66, 0.70);

  const beat = frameIndex % 4;
  const leftMove = beat === 0 || beat === 3 ? 1 : 0;
  const rightMove = beat === 1 || beat === 2 ? 1 : 0;
  const bob = frameIndex % 2 === 0 ? 0 : 1;

  clearRegion(output, width, leftHand);
  clearRegion(output, width, rightHand);
  copyShiftedRegion(source, output, width, height, upperBody, 0, bob);
  copyShiftedRegion(source, output, width, height, leftHand, -1, leftMove);
  copyShiftedRegion(source, output, width, height, rightHand, 1, rightMove);
  applyBrightnessRegion(output, width, screen, beat < 2 ? 1.08 : 0.94);

  return output;
}

function collectPalette(source, frameCount, effect) {
  const seen = new Set(['0,0,0']);
  const palette = [[0, 0, 0]];
  const addColor = (color) => {
    const key = color.join(',');
    if (!seen.has(key) && palette.length < 256) {
      seen.add(key);
      palette.push(color);
    }
  };

  if (effect === 'salt') {
    const baseColors = [];
    const baseSeen = new Set();
    for (let offset = 0; offset < source.pixels.length; offset += 4) {
      if (source.pixels[offset + 3] < 128) continue;
      const color = [source.pixels[offset], source.pixels[offset + 1], source.pixels[offset + 2]];
      const key = color.join(',');
      if (!baseSeen.has(key)) {
        baseSeen.add(key);
        baseColors.push(color);
      }
    }
    for (const color of baseColors) addColor(color);
    for (const color of baseColors) addColor(color.map((value) => clamp(value - 8)));
    for (const color of baseColors) addColor(color.map((value) => clamp(value + 8)));
    return palette;
  }

  for (let frame = 0; frame < frameCount; frame += 1) {
    const framePixels = buildMotionFrame(source.pixels, source.width, source.height, frame, frameCount, effect);
    for (let offset = 0; offset < framePixels.length; offset += 4) {
      if (framePixels[offset + 3] < 128) continue;
      const color = transformColor([framePixels[offset], framePixels[offset + 1], framePixels[offset + 2]], frame, frameCount, effect, offset / 4);
      addColor(color);
      if (palette.length >= 256) return palette;
    }
  }
  return palette;
}

function nearestPaletteIndex(color, palette) {
  let bestIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < palette.length; index += 1) {
    const candidate = palette[index];
    const dr = color[0] - candidate[0];
    const dg = color[1] - candidate[1];
    const db = color[2] - candidate[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

function buildIndexedFrame(source, palette, frameIndex, frameCount, effect) {
  const indexed = Buffer.alloc(source.pixels.length / 4);
  const framePixels = buildMotionFrame(source.pixels, source.width, source.height, frameIndex, frameCount, effect);
  for (let sourceOffset = 0, targetOffset = 0; sourceOffset < framePixels.length; sourceOffset += 4, targetOffset += 1) {
    if (framePixels[sourceOffset + 3] < 128) {
      indexed[targetOffset] = 0;
      continue;
    }
    const color = transformColor(
      [framePixels[sourceOffset], framePixels[sourceOffset + 1], framePixels[sourceOffset + 2]],
      frameIndex,
      frameCount,
      effect,
      targetOffset
    );
    indexed[targetOffset] = nearestPaletteIndex(color, palette);
  }
  return indexed;
}

function writeUInt16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function packCodes(codes, minCodeSize) {
  const bytes = [];
  let current = 0;
  let bits = 0;
  let codeSize = minCodeSize + 1;
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let nextCode = endCode + 1;

  for (const code of codes) {
    current |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      bytes.push(current & 0xff);
      current >>= 8;
      bits -= 8;
    }

    if (code === clearCode) {
      codeSize = minCodeSize + 1;
      nextCode = endCode + 1;
      continue;
    }

    if (nextCode < 4096) {
      nextCode += 1;
      if (nextCode === (1 << codeSize) && codeSize < 12) {
        codeSize += 1;
      }
    }
  }

  if (bits > 0) bytes.push(current & 0xff);
  return Buffer.from(bytes);
}

function encodeImageData(indices) {
  const minCodeSize = 8;
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const codes = [];
  for (const index of indices) {
    codes.push(clearCode, index);
  }
  codes.push(endCode);

  const packed = packCodes(codes, minCodeSize);
  const blocks = [Buffer.from([minCodeSize])];
  for (let offset = 0; offset < packed.length; offset += 255) {
    const block = packed.subarray(offset, offset + 255);
    blocks.push(Buffer.from([block.length]), block);
  }
  blocks.push(Buffer.from([0]));
  return Buffer.concat(blocks);
}

function encodeGif({ width, height, palette, frames, delay }) {
  const colorTableSize = 256;
  const colorTable = Buffer.alloc(colorTableSize * 3);
  palette.forEach((color, index) => {
    colorTable[index * 3] = color[0];
    colorTable[(index * 3) + 1] = color[1];
    colorTable[(index * 3) + 2] = color[2];
  });

  const header = Buffer.concat([
    Buffer.from('GIF89a', 'ascii'),
    writeUInt16(width),
    writeUInt16(height),
    Buffer.from([0xf7, 0, 0]),
    colorTable,
    Buffer.from([0x21, 0xff, 0x0b]),
    Buffer.from('NETSCAPE2.0', 'ascii'),
    Buffer.from([0x03, 0x01, 0x00, 0x00, 0x00])
  ]);

  const chunks = [header];
  for (const frame of frames) {
    chunks.push(
      Buffer.from([0x21, 0xf9, 0x04, 0x09]),
      writeUInt16(delay),
      Buffer.from([0x00, 0x00]),
      Buffer.from([0x2c]),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(width),
      writeUInt16(height),
      Buffer.from([0x00]),
      encodeImageData(frame)
    );
  }
  chunks.push(Buffer.from([0x3b]));
  return Buffer.concat(chunks);
}

function parsePositiveInteger(value, name, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${name}: ${value}. Expected a positive integer.`);
  }
  return parsed;
}

/**
 * Create a palette-shift animated GIF from a pixel PNG.
 *
 * @param {{ inputPath: string, outputPath: string, frames?: string | number, delay?: string | number, effect?: string }} options - Animation options.
 * @returns {Promise<{ inputPath: string, outputPath: string, width: number, height: number, frames: number, delay: number, effect: string }>} Animation summary.
 */
export async function animatePixelPngToGif({
  inputPath,
  outputPath,
  frames = 8,
  delay = 10,
  effect = 'shimmer'
}) {
  const frameCount = parsePositiveInteger(frames, 'frames', 8);
  if (frameCount < 2 || frameCount > 32) {
    throw new Error(`Invalid frames: ${frames}. Expected 2-32 frames.`);
  }
  const frameDelay = parsePositiveInteger(delay, 'delay', 10);
  const animationEffect = String(effect || 'shimmer').toLowerCase();
  if (!['shimmer', 'pulse', 'hue', 'typing', 'salt'].includes(animationEffect)) {
    throw new Error(`Invalid effect: ${effect}. Supported values: shimmer, pulse, hue, typing, salt.`);
  }

  const resolvedInput = path.resolve(inputPath);
  const resolvedOutput = path.resolve(outputPath);
  const { width, height, pixels } = decodePngToRgba(await fs.readFile(resolvedInput));
  const source = { width, height, pixels };
  const palette = collectPalette(source, frameCount, animationEffect);
  const indexedFrames = [];
  for (let frame = 0; frame < frameCount; frame += 1) {
    indexedFrames.push(buildIndexedFrame(source, palette, frame, frameCount, animationEffect));
  }

  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  await fs.writeFile(resolvedOutput, encodeGif({
    width,
    height,
    palette,
    frames: indexedFrames,
    delay: frameDelay
  }));

  return {
    inputPath: resolvedInput,
    outputPath: resolvedOutput,
    width,
    height,
    frames: frameCount,
    delay: frameDelay,
    effect: animationEffect
  };
}
