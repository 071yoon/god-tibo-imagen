// @ts-nocheck
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PIXEL_DIMENSION = 8192;

const CHANNELS_BY_COLOR_TYPE = new Map([
  [0, 1],
  [2, 3],
  [4, 2],
  [6, 4]
]);

const BAYER_MATRICES = {
  none: null,
  bayer2: [
    [0, 2],
    [3, 1]
  ],
  bayer4: [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ]
};

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

function parsePixelSize(pixelSize) {
  if (pixelSize === undefined || pixelSize === null || pixelSize === '') {
    return null;
  }

  const value = String(pixelSize).trim().toLowerCase();
  const match = value.match(/^(\d+)(?:x(\d+))?$/);
  if (!match) {
    throw new Error(`Invalid pixel size: ${pixelSize}. Use N or WIDTHxHEIGHT, for example 32 or 64x64.`);
  }

  const width = Number(match[1]);
  const height = Number(match[2] || match[1]);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_PIXEL_DIMENSION ||
    height > MAX_PIXEL_DIMENSION
  ) {
    throw new Error(`Invalid pixel size: ${pixelSize}. Dimensions must be between 1 and ${MAX_PIXEL_DIMENSION}.`);
  }

  return { width, height };
}

function readChunks(buffer) {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('Expected a PNG image.');
  }

  const chunks = [];
  let offset = PNG_SIGNATURE.length;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) {
      throw new Error('Invalid PNG chunk header.');
    }
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      throw new Error('Invalid PNG chunk length.');
    }
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd) });
    offset = dataEnd + 4;
    if (type === 'IEND') {
      break;
    }
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

function unfilterScanlines(data, width, height, bytesPerPixel) {
  const stride = width * bytesPerPixel;
  const expected = height * (stride + 1);
  if (data.length < expected) {
    throw new Error('PNG image data is shorter than expected.');
  }

  const output = Buffer.alloc(height * stride);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = data[inputOffset];
    inputOffset += 1;
    const rowOffset = y * stride;
    const prevRowOffset = rowOffset - stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = data[inputOffset + x];
      const left = x >= bytesPerPixel ? output[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? output[prevRowOffset + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? output[prevRowOffset + x - bytesPerPixel] : 0;

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

function resizeNearest(pixels, sourceWidth, sourceHeight, targetWidth, targetHeight, channels) {
  const output = Buffer.alloc(targetWidth * targetHeight * channels);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / targetWidth));
      const sourceOffset = (sourceY * sourceWidth + sourceX) * channels;
      const targetOffset = (y * targetWidth + x) * channels;
      pixels.copy(output, targetOffset, sourceOffset, sourceOffset + channels);
    }
  }
  return output;
}

function resizeArea(pixels, sourceWidth, sourceHeight, targetWidth, targetHeight, channels) {
  const output = Buffer.alloc(targetWidth * targetHeight * channels);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY0 = Math.floor((y * sourceHeight) / targetHeight);
    const sourceY1 = Math.max(sourceY0 + 1, Math.ceil(((y + 1) * sourceHeight) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX0 = Math.floor((x * sourceWidth) / targetWidth);
      const sourceX1 = Math.max(sourceX0 + 1, Math.ceil(((x + 1) * sourceWidth) / targetWidth));
      const sums = new Array(channels).fill(0);
      let count = 0;

      for (let sy = sourceY0; sy < Math.min(sourceY1, sourceHeight); sy += 1) {
        for (let sx = sourceX0; sx < Math.min(sourceX1, sourceWidth); sx += 1) {
          const sourceOffset = (sy * sourceWidth + sx) * channels;
          for (let channel = 0; channel < channels; channel += 1) {
            sums[channel] += pixels[sourceOffset + channel];
          }
          count += 1;
        }
      }

      const targetOffset = (y * targetWidth + x) * channels;
      for (let channel = 0; channel < channels; channel += 1) {
        output[targetOffset + channel] = Math.round(sums[channel] / count);
      }
    }
  }
  return output;
}

function parsePositiveInteger(value, name, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${name}: ${value}. Expected a positive integer.`);
  }
  return parsed;
}

function parsePaletteSize(value) {
  const paletteSize = parsePositiveInteger(value, 'palette size', 24);
  if (paletteSize < 2 || paletteSize > 256) {
    throw new Error(`Invalid palette size: ${value}. Expected 2-256 colors.`);
  }
  return paletteSize;
}

function parseDither(value) {
  const dither = String(value || 'none').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(BAYER_MATRICES, dither)) {
    throw new Error(`Invalid pixel dither: ${value}. Supported values: none, bayer2, bayer4.`);
  }
  return dither;
}

function parseOutline(value) {
  const outline = String(value || 'soft').toLowerCase();
  if (!['none', 'soft', 'strong'].includes(outline)) {
    throw new Error(`Invalid pixel outline: ${value}. Supported values: none, soft, strong.`);
  }
  return outline;
}

function decodePng(bytes) {
  const chunks = readChunks(bytes);
  const ihdr = chunks.find((chunk) => chunk.type === 'IHDR')?.data;
  if (!ihdr) {
    throw new Error('PNG is missing IHDR.');
  }

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const compression = ihdr[10];
  const filter = ihdr[11];
  const interlace = ihdr[12];
  const channels = CHANNELS_BY_COLOR_TYPE.get(colorType);

  if (bitDepth !== 8 || compression !== 0 || filter !== 0 || interlace !== 0 || !channels) {
    throw new Error('Only non-interlaced 8-bit grayscale/RGB/RGBA PNG images can be resized.');
  }

  const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data));
  const inflated = zlib.inflateSync(idat);
  const pixels = unfilterScanlines(inflated, width, height, channels);
  return { width, height, bitDepth, colorType, channels, pixels };
}

function splitColorBox(colors) {
  let minR = 255;
  let minG = 255;
  let minB = 255;
  let maxR = 0;
  let maxG = 0;
  let maxB = 0;
  for (const color of colors) {
    minR = Math.min(minR, color[0]);
    minG = Math.min(minG, color[1]);
    minB = Math.min(minB, color[2]);
    maxR = Math.max(maxR, color[0]);
    maxG = Math.max(maxG, color[1]);
    maxB = Math.max(maxB, color[2]);
  }

  const ranges = [maxR - minR, maxG - minG, maxB - minB];
  const axis = ranges.indexOf(Math.max(...ranges));
  const sorted = [...colors].sort((a, b) => a[axis] - b[axis]);
  const midpoint = Math.max(1, Math.floor(sorted.length / 2));
  return [sorted.slice(0, midpoint), sorted.slice(midpoint)];
}

function averageColor(colors) {
  const sums = [0, 0, 0];
  for (const color of colors) {
    sums[0] += color[0];
    sums[1] += color[1];
    sums[2] += color[2];
  }
  return sums.map((value) => Math.round(value / colors.length));
}

function buildMedianCutPalette(pixels, channels, paletteSize) {
  const colors = [];
  const stride = channels;
  for (let offset = 0; offset < pixels.length; offset += stride) {
    if ((channels === 2 && pixels[offset + 1] < 128) || (channels === 4 && pixels[offset + 3] < 128)) {
      continue;
    }
    if (channels === 1 || channels === 2) {
      colors.push([pixels[offset], pixels[offset], pixels[offset]]);
    } else {
      colors.push([pixels[offset], pixels[offset + 1], pixels[offset + 2]]);
    }
  }

  if (colors.length === 0) {
    return [[0, 0, 0]];
  }

  let boxes = [colors];
  while (boxes.length < paletteSize) {
    boxes.sort((a, b) => b.length - a.length);
    const box = boxes.shift();
    if (!box || box.length <= 1) {
      if (box) boxes.push(box);
      break;
    }
    const [left, right] = splitColorBox(box);
    boxes.push(left, right);
  }

  const seen = new Set();
  const palette = [];
  for (const color of boxes.filter((box) => box.length > 0).map(averageColor)) {
    const key = color.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      palette.push(color);
    }
  }
  return palette;
}

function nearestPaletteColor(color, palette) {
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of palette) {
    const dr = color[0] - candidate[0];
    const dg = color[1] - candidate[1];
    const db = color[2] - candidate[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function luminance(color) {
  return (0.299 * color[0]) + (0.587 * color[1]) + (0.114 * color[2]);
}

function colorDistanceSquared(left, right) {
  const dr = left[0] - right[0];
  const dg = left[1] - right[1];
  const db = left[2] - right[2];
  return dr * dr + dg * dg + db * db;
}

function darkenColor(color, factor) {
  return color.map((value) => Math.max(0, Math.round(value * factor)));
}

function nearestDarkerPaletteColor(color, palette, target) {
  const originalLum = luminance(color);
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of palette) {
    if (luminance(candidate) > originalLum - 4) {
      continue;
    }
    const distance = colorDistanceSquared(candidate, target);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best || nearestPaletteColor(target, palette);
}

function shouldProtectFromDither(color) {
  const [red, green, blue] = color;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const saturation = max - min;
  const warmSkinLike = red >= 130 && green >= 80 && blue >= 45 && red >= green && green >= blue && red - blue <= 120;
  const lightFocalFlat = red >= 170 && green >= 140 && blue >= 100 && saturation <= 90;
  return warmSkinLike || lightFocalFlat;
}

function boostOutlineContrast(pixels, width, height, channels, palette, outline) {
  if (outline === 'none') {
    return { pixels, boostedPixels: 0 };
  }

  const output = Buffer.from(pixels);
  const threshold = outline === 'strong' ? 32 : 48;
  const darkGap = outline === 'strong' ? 8 : 18;
  const factor = outline === 'strong' ? 0.55 : 0.72;
  let boostedPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      if ((channels === 2 && pixels[offset + 1] < 128) || (channels === 4 && pixels[offset + 3] < 128)) {
        continue;
      }

      const color = channels === 1 || channels === 2
        ? [pixels[offset], pixels[offset], pixels[offset]]
        : [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
      const colorLum = luminance(color);
      let maxDistance = 0;
      let brightestNeighborLum = colorLum;
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1]
      ];

      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const neighborOffset = (ny * width + nx) * channels;
        if ((channels === 2 && pixels[neighborOffset + 1] < 128) || (channels === 4 && pixels[neighborOffset + 3] < 128)) {
          continue;
        }
        const neighbor = channels === 1 || channels === 2
          ? [pixels[neighborOffset], pixels[neighborOffset], pixels[neighborOffset]]
          : [pixels[neighborOffset], pixels[neighborOffset + 1], pixels[neighborOffset + 2]];
        maxDistance = Math.max(maxDistance, colorDistanceSquared(color, neighbor));
        brightestNeighborLum = Math.max(brightestNeighborLum, luminance(neighbor));
      }

      if (maxDistance < threshold * threshold || colorLum > brightestNeighborLum - darkGap) {
        continue;
      }

      const boosted = nearestDarkerPaletteColor(color, palette, darkenColor(color, factor));
      if (channels === 1 || channels === 2) {
        output[offset] = Math.round((boosted[0] + boosted[1] + boosted[2]) / 3);
      } else {
        output[offset] = boosted[0];
        output[offset + 1] = boosted[1];
        output[offset + 2] = boosted[2];
      }
      boostedPixels += 1;
    }
  }

  return { pixels: output, boostedPixels };
}

function quantizePixels(pixels, width, height, channels, paletteSize, dither) {
  const palette = buildMedianCutPalette(pixels, channels, paletteSize);
  const output = Buffer.from(pixels);
  const matrix = BAYER_MATRICES[dither];
  const matrixSize = matrix?.length || 0;
  const ditherStrength = matrixSize > 0 ? 18 : 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      if ((channels === 2 && output[offset + 1] < 128) || (channels === 4 && output[offset + 3] < 128)) {
        continue;
      }

      const base = channels === 1 || channels === 2
        ? [output[offset], output[offset], output[offset]]
        : [output[offset], output[offset + 1], output[offset + 2]];
      const threshold = matrix && !shouldProtectFromDither(base)
        ? ((matrix[y % matrixSize][x % matrixSize] / (matrixSize * matrixSize - 1)) - 0.5) * ditherStrength
        : 0;
      const source = [base[0] + threshold, base[1] + threshold, base[2] + threshold];
      const nearest = nearestPaletteColor(source, palette);

      if (channels === 1 || channels === 2) {
        output[offset] = Math.round((nearest[0] + nearest[1] + nearest[2]) / 3);
      } else {
        output[offset] = nearest[0];
        output[offset + 1] = nearest[1];
        output[offset + 2] = nearest[2];
      }
      if (channels === 2) output[offset + 1] = output[offset + 1] < 128 ? 0 : 255;
      if (channels === 4) output[offset + 3] = output[offset + 3] < 128 ? 0 : 255;
    }
  }

  return { pixels: output, palette };
}

function writeChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng({ width, height, bitDepth, colorType, pixels, channels }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * channels;
  const scanlines = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const targetOffset = y * (stride + 1);
    scanlines[targetOffset] = 0;
    pixels.copy(scanlines, targetOffset + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    writeChunk('IHDR', ihdr),
    writeChunk('IDAT', zlib.deflateSync(scanlines)),
    writeChunk('IEND')
  ]);
}

/**
 * Resize a PNG buffer with nearest-neighbor sampling.
 *
 * @param {Buffer} bytes - Source PNG bytes.
 * @param {string | number | null | undefined} pixelSize - Target size as N or WIDTHxHEIGHT.
 * @returns {Buffer} Resized PNG bytes, or the original bytes when no pixel size is provided.
 */
export function resizePngBytes(bytes, pixelSize) {
  const target = parsePixelSize(pixelSize);
  if (!target) {
    return bytes;
  }

  const { width, height, bitDepth, colorType, channels, pixels } = decodePng(bytes);

  if (width === target.width && height === target.height) {
    return bytes;
  }

  const resized = resizeNearest(pixels, width, height, target.width, target.height, channels);
  return encodePng({
    width: target.width,
    height: target.height,
    bitDepth,
    colorType,
    pixels: resized,
    channels
  });
}

/**
 * Process a PNG into a constrained pixel-art output.
 *
 * @param {Buffer} bytes - Source PNG bytes.
 * @param {{ pixelSize: string | number, paletteSize?: string | number, dither?: string, outline?: string }} options - Pixel-art processing options.
 * @returns {{ bytes: Buffer, metadata: { width: number, height: number, paletteSize: number, actualPaletteSize: number, dither: string, outline: string, outlineBoostedPixels: number } }} Processed PNG bytes and summary metadata.
 */
export function processPixelArtPngBytes(bytes, options) {
  const target = parsePixelSize(options?.pixelSize);
  if (!target) {
    throw new Error('pixelSize is required when pixel mode is enabled.');
  }

  const paletteSize = parsePaletteSize(options?.paletteSize);
  const dither = parseDither(options?.dither);
  const outline = parseOutline(options?.outline);
  const { width, height, bitDepth, colorType, channels, pixels } = decodePng(bytes);
  const resized = resizeArea(pixels, width, height, target.width, target.height, channels);
  const quantized = quantizePixels(resized, target.width, target.height, channels, paletteSize, dither);
  const outlined = boostOutlineContrast(
    quantized.pixels,
    target.width,
    target.height,
    channels,
    quantized.palette,
    outline
  );

  return {
    bytes: encodePng({
      width: target.width,
      height: target.height,
      bitDepth,
      colorType,
      pixels: outlined.pixels,
      channels
    }),
    metadata: {
      width: target.width,
      height: target.height,
      paletteSize,
      actualPaletteSize: quantized.palette.length,
      dither,
      outline,
      outlineBoostedPixels: outlined.boostedPixels
    }
  };
}

/**
 * Upscale a PNG using nearest-neighbor sampling.
 *
 * @param {Buffer} bytes - Source PNG bytes.
 * @param {string | number} scale - Positive integer scale factor.
 * @returns {Buffer} Upscaled PNG bytes.
 */
export function upscalePngBytes(bytes, scale) {
  const factor = parsePositiveInteger(scale, 'preview upscale', 1);
  if (factor === 1) {
    return bytes;
  }
  const { width, height, bitDepth, colorType, channels, pixels } = decodePng(bytes);
  const resized = resizeNearest(pixels, width, height, width * factor, height * factor, channels);
  return encodePng({
    width: width * factor,
    height: height * factor,
    bitDepth,
    colorType,
    pixels: resized,
    channels
  });
}
